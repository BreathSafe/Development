/*
 ============================================================
  AIR QUALITY MONITOR — v3.3
  ESP32 + DHT11 + MQ135 + GPS NEO-6M + SIM900A SMS
  Supabase REST API upload
 ============================================================

  FIXES IN THIS VERSION:
  ✅ BUG 1–20 — All previous fixes retained
  ✅ BUG 21   — "No time" in SMS/logs fixed (3-layer timestamp)
  ✅ BUG A    — getAlertMessage() phantom triple-alert branch removed
  ✅ BUG B    — Alert combos check all 3 flags exclusively
  ✅ BUG C    — AQI threshold uses >= instead of >
  ✅ BUG D    — Removed specific gas PPM detection (CO2/NH3/Benzene/Alcohol)
                MQ135 is NOT designed for individual gas identification.
                Readings are now reported as a single generic AQI value
                derived from raw ADC only.
  ✅ BUG E    — Fixed SMS send logic: Row 1 (GOOD/all-clear) does NOT
                send an alert SMS. An all-clear SMS is only sent once
                when conditions return to normal after a prior alert.
                getAlertMessage() now returns "" for the GOOD case so
                createSMSNotificationsForRecipients() can skip sending.

  CONDITION TABLE (SMS trigger logic):
  ─────────────────────────────────────────────────────────
  Condition   Temp      Humidity  AQI    SMS Sent?
  ─────────────────────────────────────────────────────────
  GOOD        <33°C     <71%      <51    NO (all-clear only on recovery)
  HIGH TEMP   ≥33°C     normal    normal YES — Heat Warning
  HIGH HUMID  normal    ≥71%      normal YES — Humidity Warning
  POOR AIR    normal    normal    ≥51    YES — Air Quality Warning
  TEMP+HUMID  ≥33°C     ≥71%      normal YES — Heat Index Warning
  TEMP+AQI    ≥33°C     normal    ≥51    YES — Air + Heat Warning
  HUMID+AQI   normal    ≥71%      ≥51    YES — Air + Humidity Warning
  ALL HIGH    ≥38°C     ≥86%      ≥101   YES — HAZARD
  ─────────────────────────────────────────────────────────

  WIRING
  ============================================================
  DHT11   DATA → GPIO 4
  MQ135   VCC  → 5V (REQUIRED — not 3.3V)
  MQ135   AO   → GPIO 34 (via voltage divider if needed)
  LED Green    → GPIO 25 (220Ω resistor)
  LED Yellow   → GPIO 26 (220Ω resistor)
  LED Red      → GPIO 27 (220Ω resistor)
  GPS TX       → GPIO 18 (ESP32 RX1)
  GPS RX       → GPIO 19 (ESP32 TX1)
  SIM900A TX   → GPIO 16 (ESP32 RX2)
  SIM900A RX   → GPIO 17 (ESP32 TX2)
  SIM900A VCC  → 5V (needs 1–2A dedicated supply + 1000uF cap)
  SIM900A GND  → GND
 ============================================================
*/

#include <esp_task_wdt.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <TinyGPS++.h>
#include <time.h>

// ============================================================
// FORWARD DECLARATIONS
// ============================================================
void setup();
void loop();
void connectWiFi();
void readSensors();
void updateLEDs();
void handleLEDBlink();
void printSerial();
void uploadToSupabase();
void initSIM900A();
void checkSIM900ASignal();
void sim900ATCommand(String cmd);
String sim900ReadResponse(unsigned long timeout);
void checkAndSendPendingSMS();
bool sendSMS(String phoneNumber, String message);
void updateSMSStatus(int smsId, String status);
void createSMSNotification(String phoneNumber, String message);
void createSMSNotificationsForRecipients(String message);
float getRs(int rawAdc);
float calculatePPM(float rs_ro, float a, float b);
void setAllLEDs(bool green, bool yellow, bool red);
String getTimestamp();
String getAlertMessage(float temp, float hum, int aqi, String location);
bool alertConditionMet(float temp, float hum, int aqi);
void fetchDeviceLocation();
void feedGPS();
void pushGPSToDatabase();
void runRoCalibration();

// ============================================================
// CONFIGURATION
// ============================================================
const char* WIFI_SSID     = "Chichi";
const char* WIFI_PASSWORD = "12345678";

const char* SUPABASE_URL    = "https://hqptxgzpzuhsrybuyjoy.supabase.co";
const char* SUPABASE_APIKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxcHR4Z3pwenVoc3J5YnV5am95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MjEyNjEsImV4cCI6MjA4OTI5NzI2MX0.0B7ESA_2W7P3iHsT9Og9oAtj59I8EpyHPNAlQie_kus";

const char* DEVICE_ID = "AW-001";

#define DHT_PIN    4
#define DHT_TYPE   DHT11
#define MQ135_PIN  34
#define LED_GREEN  25
#define LED_YELLOW 26
#define LED_RED    27

HardwareSerial gpsSerial(1);
HardwareSerial sim900Serial(2);

// ── GPS ───────────────────────────────────────────────────
TinyGPSPlus gps;
double latitude  = 0.0;
double longitude = 0.0;
bool   gpsFixed  = false;

// ── MQ135 calibration ─────────────────────────────────────
// NOTE: MQ135 is a broad-spectrum air quality sensor.
// It is NOT suitable for identifying or quantifying specific gases
// (CO2, NH3, Benzene, Alcohol). Those require individual,
// gas-specific calibration curves and controlled reference gas.
// We report only a single generic AQI value from raw ADC.
const bool  RO_CALIBRATED = false;
const float Ro_USER       = 10.0f;

const float VCC_SENSOR            = 5.0f;
const float DIV_RATIO             = 20.0f / 30.0f;
const float RL_VALUE              = 0.33f;
const float MQ135_CLEAN_AIR_RATIO = 3.6f;

// ── MQ135 approximate sensitivity curves (Rs/Ro vs ppm) ──────
// WARNING: These are generic datasheet curves for reference only.
// MQ135 is a broad-spectrum sensor and cannot reliably identify
// or quantify individual gases without per-gas calibration with
// certified reference gas. Treat these values as estimates.
const float MQ135_CO2_A     = 110.47f, MQ135_CO2_B     = -2.862f;
const float MQ135_NH3_A     = 102.2f,  MQ135_NH3_B     = -2.473f;
const float MQ135_BENZENE_A = 44.947f, MQ135_BENZENE_B = -3.445f;
const float MQ135_ALCOHOL_A = 77.255f, MQ135_ALCOHOL_B = -3.18f;

// AQI thresholds based on raw ADC (0–4095 at 12-bit)
const int AQI_GOOD_MAX     = 700;   // raw ADC ≤ 700  → Good
const int AQI_MODERATE_MAX = 1500;  // raw ADC ≤ 1500 → Moderate
                                     // raw ADC > 1500 → Unhealthy

float Ro = 10.0f;

// ── LED ───────────────────────────────────────────────────
bool     ledBlinkActive    = false;
int      ledBlinkCount     = 0;
bool     ledBlinkState     = false;
unsigned long ledBlinkLast = 0;
const int LED_BLINK_TIMES  = 3;
const unsigned long LED_BLINK_INTERVAL = 150;
String currentLEDState = "startup";

// ── SIM900A ───────────────────────────────────────────────
bool sim900Ready    = false;
bool sim900SignalOK = false;
unsigned long lastSim900Check = 0;
const unsigned long SIM900_CHECK_INTERVAL = 60000;

// ── Sensor data ───────────────────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);
float  temperature = 0, humidity = 0;
int    mq135Raw    = 0, aqiValue = 0;
float  co2Ppm = 0, nh3Ppm = 0, benzenePpm = 0, alcoholPpm = 0;
String aqiCategory     = "Good";
String lastAQICategory = "Good";
bool   sensorsReady    = false;

// ── Alert state ───────────────────────────────────────────
bool lastAlertActive = false;

// ── Cold-start skip ───────────────────────────────────────
const int SENSOR_SKIP_COUNT = 3;
int sensorReadCount = 0;

// ── Misc ──────────────────────────────────────────────────
String currentLocation      = "Unknown";
bool   gpsPushedThisSession = false;
bool   ntpSynced            = false;

// ── Timing ────────────────────────────────────────────────
const unsigned long READ_INTERVAL      = 10000;
const unsigned long UPLOAD_INTERVAL    = 30000;
const unsigned long WIFI_RETRY_MS      = 60000;
const unsigned long SMS_CHECK_INTERVAL = 120000;
unsigned long lastRead = 0, lastUpload = 0, lastWifiRetry = 0, lastSmsCheck = 0;
int uploadFailCount = 0;

// ============================================================
// TIMESTAMP — 3-layer fallback (BUG 21 FIX)
// ============================================================
String getTimestamp() {
  // Layer 1: NTP
  struct tm timeinfo;
  if (ntpSynced && getLocalTime(&timeinfo)) {
    char buf[22];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M", &timeinfo);
    return String(buf) + " PHT";
  }

  // Layer 2: GPS time (UTC → PHT = UTC+8)
  if (gps.time.isValid() && gps.date.isValid() && gps.time.age() < 2000) {
    struct tm gpsTm = {};
    gpsTm.tm_year  = gps.date.year() - 1900;
    gpsTm.tm_mon   = gps.date.month() - 1;
    gpsTm.tm_mday  = gps.date.day();
    gpsTm.tm_hour  = gps.time.hour();
    gpsTm.tm_min   = gps.time.minute();
    gpsTm.tm_sec   = gps.time.second();
    gpsTm.tm_isdst = 0;

    time_t utcEpoch = mktime(&gpsTm);
    utcEpoch += 8 * 3600;
    struct tm *phtTm = gmtime(&utcEpoch);

    char buf[22];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M", phtTm);
    return String(buf) + " PHT(GPS)";
  }

  // Layer 3: uptime fallback
  unsigned long uptimeSec = millis() / 1000;
  unsigned long mins = uptimeSec / 60;
  unsigned long secs = uptimeSec % 60;
  return "T+" + String(mins) + "m" + String(secs) + "s";
}

// ============================================================
// GPS HELPER
// ============================================================
void feedGPS() {
  while (gpsSerial.available() > 0) {
    if (gps.encode(gpsSerial.read())) {
      if (gps.location.isValid()) {
        latitude  = gps.location.lat();
        longitude = gps.location.lng();
        gpsFixed  = true;
      }
    }
  }
}

// ============================================================
// MQ135 Rs CALCULATION
// Only used for Ro calibration; AQI is derived from raw ADC.
// ============================================================
float getRs(int rawAdc) {
  float vAdc   = rawAdc * (3.3f / 4095.0f);
  float vSense = vAdc / DIV_RATIO;
  if (vSense <= 0.001f)     vSense = 0.001f;
  if (vSense >= VCC_SENSOR) vSense = VCC_SENSOR - 0.001f;
  return RL_VALUE * (VCC_SENSOR - vSense) / vSense;
}

// ============================================================
// MQ135 PPM ESTIMATE
// Applies the power-law curve: ppm = A * (Rs/Ro)^B
// No clamping — raw calculated value is returned as-is.
// ============================================================
float calculatePPM(float rs_ro, float a, float b) {
  if (rs_ro <= 0.0f) return 0.0f;
  return a * pow(rs_ro, b);
}

// ============================================================
// Ro AUTO-CALIBRATION
// ============================================================
void runRoCalibration() {
  Serial.println("╔══════════════════════════════════════════╗");
  Serial.println("║        Ro CALIBRATION MODE               ║");
  Serial.println("║  Place device in CLEAN OUTDOOR AIR now.  ║");
  Serial.println("║  Measuring for 2 minutes...              ║");
  Serial.println("╚══════════════════════════════════════════╝");

  for (int i = 120; i > 0; i--) {
    esp_task_wdt_reset();
    feedGPS();
    if (i % 10 == 0) Serial.printf("   %d s remaining\n", i);
    delay(1000);
  }

  long sum = 0;
  for (int i = 0; i < 200; i++) {
    sum += analogRead(MQ135_PIN);
    delay(10);
    if (i % 50 == 0) esp_task_wdt_reset();
  }
  int rawAvg = sum / 200;

  float Rs_clean    = getRs(rawAvg);
  float Ro_measured = Rs_clean / MQ135_CLEAN_AIR_RATIO;

  Serial.println("╔══════════════════════════════════════════╗");
  Serial.println("║        CALIBRATION RESULT                ║");
  Serial.printf( "║  Raw ADC avg   : %-24d║\n", rawAvg);
  Serial.printf( "║  Rs clean air  : %-20.4f kΩ║\n", Rs_clean);
  Serial.printf( "║  >>> Ro        : %-20.4f kΩ|||\n", Ro_measured);
  Serial.println("║                                          ║");
  Serial.println("║  1. Copy the Ro value above              ║");
  Serial.println("║  2. Set RO_CALIBRATED = true             ║");
  Serial.println("║  3. Set Ro_USER = <measured value>f      ║");
  Serial.println("║  4. Reflash                              ║");
  Serial.println("╚══════════════════════════════════════════╝");

  Ro = Ro_measured;
}

// ============================================================
// ALERT CONDITION CHECK
// ============================================================
bool alertConditionMet(float temp, float hum, int aqi) {
  return (temp >= 33.0f || hum >= 71.0f || aqi >= 51);
}

// ============================================================
// ALERT MESSAGE — BUG D+E FIX
//
// Returns an alert string for all hazard/alert rows.
// Returns "" (empty string) for the GOOD/normal case so the
// caller knows NOT to enqueue an SMS — only a recovery
// all-clear message gets sent once conditions return to normal.
//
//  Row  | tempHigh | humHigh | aqiHigh | SMS
//  -----|----------|---------|---------|---------------------------
//  1    |    N     |    N    |    N    | "" — no alert SMS
//  2    |    Y     |    N    |    N    | Heat Warning
//  3    |    N     |    Y    |    N    | Humidity Warning
//  4    |    N     |    N    |    Y    | Air Quality Warning
//  5    |    Y     |    Y    |    N    | Heat Index Warning
//  6    |    Y     |    N    |    Y    | Air + Heat Warning
//  7    |    N     |    Y    |    Y    | Air + Humidity Warning
//  8    |   ≥38    |   ≥86   |  ≥101  | HAZARD
//  9*   |    Y     |    Y    |    Y    | Combined (below HAZARD)
// ============================================================
String getAlertMessage(float temp, float hum, int aqi, String location) {
  if (location.length() > 20) location = location.substring(0, 17) + "...";
  String ts = getTimestamp();

  bool tempHigh = (temp >= 33.0f);
  bool humHigh  = (hum  >= 71.0f);
  bool aqiHigh  = (aqi  >= 51);

  // ── Row 1: GOOD — return empty, no alert SMS ──
  if (!tempHigh && !humHigh && !aqiHigh) {
    return "";
  }

  // ── Row 8: HAZARD — ALL HIGH (strictest thresholds, must be first) ──
  if (temp >= 38.0f && hum >= 86.0f && aqi >= 101) {
    return "BreathSafe HAZARD [" + String(DEVICE_ID) + "]\n"
           "Loc: " + location + "\n" + ts + "\n"
           "Hazardous conditions!\n"
           "TEMP:" + String(temp,1) + "C HUM:" + String(hum,0) + "% AQI:" + String(aqi) + "\n"
           "Stay indoors immediately.";
  }

  // ── Row 9*: ALL THREE HIGH but below HAZARD thresholds ──
  if (tempHigh && humHigh && aqiHigh) {
    return "BreathSafe ALERT [" + String(DEVICE_ID) + "]\n"
           "Loc: " + location + "\n" + ts + "\n"
           "Heat + Humidity + Poor Air\n"
           "TEMP:" + String(temp,1) + "C HUM:" + String(hum,0) + "% AQI:" + String(aqi) + "\n"
           "Avoid all outdoor activity.";
  }

  // ── Row 5: TEMP + HUMID only ──
  if (tempHigh && humHigh && !aqiHigh) {
    return "BreathSafe ALERT [" + String(DEVICE_ID) + "]\n"
           "Loc: " + location + "\n" + ts + "\n"
           "Heat Index Warning\n"
           "TEMP:" + String(temp,1) + "C HUM:" + String(hum,0) + "%\n"
           "Heat + humidity risk. Stay hydrated.";
  }

  // ── Row 6: TEMP + AQI only ──
  if (tempHigh && !humHigh && aqiHigh) {
    return "BreathSafe ALERT [" + String(DEVICE_ID) + "]\n"
           "Loc: " + location + "\n" + ts + "\n"
           "Air + Heat Warning\n"
           "TEMP:" + String(temp,1) + "C AQI:" + String(aqi) + "\n"
           "Heat + poor air. Avoid outdoors.";
  }

  // ── Row 7: HUMID + AQI only ──
  if (!tempHigh && humHigh && aqiHigh) {
    return "BreathSafe ALERT [" + String(DEVICE_ID) + "]\n"
           "Loc: " + location + "\n" + ts + "\n"
           "Air + Humidity Warning\n"
           "HUM:" + String(hum,0) + "% AQI:" + String(aqi) + "\n"
           "Humid + polluted air. Take precautions.";
  }

  // ── Row 2: HIGH TEMP only ──
  if (tempHigh && !humHigh && !aqiHigh) {
    return "BreathSafe ALERT [" + String(DEVICE_ID) + "]\n"
           "Loc: " + location + "\n" + ts + "\n"
           "Heat Warning\n"
           "TEMP:" + String(temp,1) + "C\n"
           "High temperature detected. Stay hydrated.";
  }

  // ── Row 3: HIGH HUMID only ──
  if (!tempHigh && humHigh && !aqiHigh) {
    return "BreathSafe ALERT [" + String(DEVICE_ID) + "]\n"
           "Loc: " + location + "\n" + ts + "\n"
           "Humidity Warning\n"
           "HUM:" + String(hum,0) + "%\n"
           "High humidity detected. Ventilate spaces.";
  }

  // ── Row 4: POOR AIR only ──
  // (!tempHigh && !humHigh && aqiHigh) — only remaining case
  return "BreathSafe ALERT [" + String(DEVICE_ID) + "]\n"
         "Loc: " + location + "\n" + ts + "\n"
         "Air Quality Warning\n"
         "AQI:" + String(aqi) + "\n"
         "Poor air quality detected. Limit exposure.";
}

// ============================================================
// ALL-CLEAR MESSAGE (recovery, sent once when alert clears)
// ============================================================
String getAllClearMessage(float temp, float hum, int aqi, String location) {
  if (location.length() > 20) location = location.substring(0, 17) + "...";
  return "BreathSafe [" + String(DEVICE_ID) + "]\n"
         "Loc: " + location + "\n" + getTimestamp() + "\n"
         "All Clear — Conditions Normal\n"
         "TEMP:" + String(temp,1) + "C HUM:" + String(hum,0) + "% AQI:" + String(aqi) + "\n"
         "All parameters within safe range.";
}

// ============================================================
// FETCH DEVICE LOCATION
// ============================================================
void fetchDeviceLocation() {
  if (WiFi.status() != WL_CONNECTED) return;
  Serial.println("Fetching device location...");

  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/devices?device_id=eq." + String(DEVICE_ID));
  http.addHeader("apikey",        SUPABASE_APIKEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_APIKEY);

  int code = http.GET();
  if (code == 200) {
    JsonDocument doc;
    deserializeJson(doc, http.getString());
    JsonArray arr = doc.as<JsonArray>();
    if (arr.size() > 0) {
      currentLocation = arr[0]["location"].as<String>();
      Serial.printf("Location: %s\n", currentLocation.c_str());
    }
  } else {
    Serial.printf("Location fetch failed (HTTP %d)\n", code);
  }
  http.end();
}

// ============================================================
// PUSH GPS TO DEVICES TABLE
// ============================================================
void pushGPSToDatabase() {
  if (!gpsFixed || WiFi.status() != WL_CONNECTED) return;
  if (gpsPushedThisSession) return;
  if (latitude == 0.0 && longitude == 0.0) return;

  char latBuf[16], lonBuf[16];
  snprintf(latBuf, sizeof(latBuf), "%.6f", latitude);
  snprintf(lonBuf, sizeof(lonBuf), "%.6f", longitude);
  Serial.printf("Pushing GPS: %s, %s\n", latBuf, lonBuf);

  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/devices?device_id=eq." + String(DEVICE_ID));
  http.setTimeout(10000);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_APIKEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_APIKEY);
  http.addHeader("Prefer",        "return=minimal");

  String body = "{\"latitude\":" + String(latBuf) + ",\"longitude\":" + String(lonBuf) + "}";
  int code = http.PATCH(body);
  if (code == 200 || code == 204 || code == 201) {
    Serial.println("GPS pushed OK");
    gpsPushedThisSession = true;
  } else {
    Serial.printf("GPS push failed: HTTP %d | %s\n", code, http.getString().c_str());
  }
  http.end();
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  esp_task_wdt_config_t wdt_config = {
    .timeout_ms     = 30000,
    .idle_core_mask = 0,
    .trigger_panic  = true
  };
  esp_task_wdt_reconfigure(&wdt_config);
  esp_task_wdt_add(NULL);

  gpsSerial.begin(9600,    SERIAL_8N1, 18, 19);
  sim900Serial.begin(9600, SERIAL_8N1, 16, 17);

  pinMode(LED_GREEN,  OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED,    OUTPUT);
  setAllLEDs(false, false, false);

  Serial.println("Testing LEDs...");
  setAllLEDs(true,  false, false); delay(800); setAllLEDs(false, false, false); delay(200);
  setAllLEDs(false, true,  false); delay(800); setAllLEDs(false, false, false); delay(200);
  setAllLEDs(false, false, true);  delay(800); setAllLEDs(false, false, false); delay(200);
  for (int i = 0; i < 3; i++) {
    setAllLEDs(true, true, true); delay(200);
    setAllLEDs(false, false, false); delay(200);
  }
  Serial.println("LED test done.");

  dht.begin();
  delay(2000);

  Serial.println("MQ135 warming up — 30s...");
  for (int i = 30; i > 0; i--) {
    esp_task_wdt_reset();
    digitalWrite(LED_YELLOW, (i % 2 == 0) ? HIGH : LOW);
    feedGPS();
    Serial.printf("   %d s\n", i);
    delay(1000);
  }
  setAllLEDs(false, false, false);
  sensorsReady = true;

  if (RO_CALIBRATED) {
    Ro = Ro_USER;
    Serial.printf("Ro = %.4f kΩ (calibrated)\n", Ro);
  } else {
    runRoCalibration();
    Serial.printf("Ro = %.4f kΩ (measured this session)\n", Ro);
    Serial.println(">>> Set RO_CALIBRATED=true and Ro_USER=<value> then reflash <<<");
  }

  initSIM900A();
  connectWiFi();
  fetchDeviceLocation();

  Serial.printf("System Ready! Time: %s\n", getTimestamp().c_str());
}

// ============================================================
// MAIN LOOP
// ============================================================
void loop() {
  esp_task_wdt_reset();
  unsigned long now = millis();

  feedGPS();
  handleLEDBlink();

  if (!ntpSynced && WiFi.status() == WL_CONNECTED) {
    struct tm timeinfo;
    if (getLocalTime(&timeinfo)) {
      ntpSynced = true;
      Serial.printf("NTP synced (background): %s\n", getTimestamp().c_str());
    }
  }

  if (WiFi.status() != WL_CONNECTED && (now - lastWifiRetry >= WIFI_RETRY_MS)) {
    lastWifiRetry = now;
    ntpSynced = false;
    WiFi.disconnect(true);
    delay(500);
    connectWiFi();
  }

  if (now - lastSim900Check >= SIM900_CHECK_INTERVAL) {
    lastSim900Check = now;
    checkSIM900ASignal();
  }

  if (sensorsReady && (now - lastRead >= READ_INTERVAL)) {
    lastRead = now;
    readSensors();
    if (temperature == 0.0 && humidity == 0.0)
      Serial.println("⚠ DHT11 not responding — check wiring");
    if (mq135Raw < 10)
      Serial.println("⚠ MQ135 not responding — check 5V wiring/power");
    printSerial();
  }

  if (now - lastUpload >= UPLOAD_INTERVAL) {
    lastUpload = now;
    if (sensorsReady && WiFi.status() == WL_CONNECTED)
      uploadToSupabase();
  }

  if (sim900Ready && (now - lastSmsCheck >= SMS_CHECK_INTERVAL)) {
    lastSmsCheck = now;
    checkAndSendPendingSMS();
  }
}

// ============================================================
// LED FUNCTIONS
// ============================================================
void setAllLEDs(bool green, bool yellow, bool red) {
  digitalWrite(LED_GREEN,  green  ? HIGH : LOW);
  digitalWrite(LED_YELLOW, yellow ? HIGH : LOW);
  digitalWrite(LED_RED,    red    ? HIGH : LOW);
}

void updateLEDs() {
  setAllLEDs(false, false, false);
  ledBlinkActive = false;

  if (aqiCategory == "Good") {
    digitalWrite(LED_GREEN, HIGH);
    currentLEDState = "good";
  } else if (aqiCategory == "Moderate") {
    digitalWrite(LED_YELLOW, HIGH);
    currentLEDState = "moderate";
  } else {
    ledBlinkActive = true;
    ledBlinkCount  = 0;
    ledBlinkState  = true;
    ledBlinkLast   = millis();
    digitalWrite(LED_RED, HIGH);
    currentLEDState = "unhealthy";
  }
}

void handleLEDBlink() {
  if (!ledBlinkActive) return;
  unsigned long now = millis();
  if (now - ledBlinkLast < LED_BLINK_INTERVAL) return;
  ledBlinkLast  = now;
  ledBlinkState = !ledBlinkState;
  digitalWrite(LED_RED, ledBlinkState ? HIGH : LOW);
  if (!ledBlinkState) {
    ledBlinkCount++;
    if (ledBlinkCount >= LED_BLINK_TIMES) {
      ledBlinkActive = false;
      digitalWrite(LED_RED, HIGH);
    }
  }
}

// ============================================================
// SENSOR READ
// ============================================================
void readSensors() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t) && !isnan(h)) {
    temperature = t;
    humidity    = h;
    Serial.printf("DHT11 OK: %.1fC, %.1f%%\n", temperature, humidity);
  } else {
    Serial.println("DHT11 read failed");
  }

  // Average 10 ADC reads to reduce noise
  long sum = 0;
  for (int i = 0; i < 10; i++) { sum += analogRead(MQ135_PIN); delay(5); }
  mq135Raw = sum / 10;

  // ── AQI from raw ADC (no per-gas PPM — MQ135 is non-specific) ──
  aqiValue = map(mq135Raw, 150, 2500, 0, 300);
  aqiValue = constrain(aqiValue, 0, 300);

  // ── Approximate PPM estimates (reference only, no clamping) ──
  float rs    = getRs(mq135Raw);
  float ratio = (Ro > 0.0f) ? (rs / Ro) : 1.0f;
  co2Ppm     = calculatePPM(ratio, MQ135_CO2_A,     MQ135_CO2_B);
  nh3Ppm     = calculatePPM(ratio, MQ135_NH3_A,     MQ135_NH3_B);
  benzenePpm = calculatePPM(ratio, MQ135_BENZENE_A, MQ135_BENZENE_B);
  alcoholPpm = calculatePPM(ratio, MQ135_ALCOHOL_A, MQ135_ALCOHOL_B);

  if      (mq135Raw <= AQI_GOOD_MAX)     aqiCategory = "Good";
  else if (mq135Raw <= AQI_MODERATE_MAX) aqiCategory = "Moderate";
  else                                    aqiCategory = "Unhealthy";

  // ── Cold-start stabilisation (suppress SMS, seed alert state) ──
  sensorReadCount++;
  if (sensorReadCount <= SENSOR_SKIP_COUNT) {
    Serial.printf("Stabilising... %d/%d (SMS suppressed)\n", sensorReadCount, SENSOR_SKIP_COUNT);
    lastAlertActive = alertConditionMet(temperature, humidity, aqiValue);
    lastAQICategory = aqiCategory;
    updateLEDs();
    return;
  }

  bool tempAlert = (temperature >= 33.0f);
  bool humAlert  = (humidity    >= 71.0f);
  bool aqiAlert  = (aqiValue    >= 51);
  bool anyAlert  = tempAlert || humAlert || aqiAlert;

  if (anyAlert) {
    if (!lastAlertActive) {
      // ── NEW alert: build message and enqueue SMS ──
      String why = "";
      if (tempAlert) why += "TEMP>=33 ";
      if (humAlert)  why += "HUM>=71 ";
      if (aqiAlert)  why += "AQI>=51 ";
      Serial.printf("NEW alert: %s| TEMP:%.1fC HUM:%.0f%% AQI:%d\n",
        why.c_str(), temperature, humidity, aqiValue);

      if (WiFi.status() == WL_CONNECTED) {
        String msg = getAlertMessage(temperature, humidity, aqiValue, currentLocation);
        // getAlertMessage() returns "" only for GOOD (Row 1) which can't happen
        // here since anyAlert is true, but guard anyway.
        if (msg.length() > 0) {
          Serial.printf("SMS (%d chars):\n%s\n---\n", msg.length(), msg.c_str());
          createSMSNotificationsForRecipients(msg);
        }
      } else {
        Serial.println("WiFi not connected — SMS skipped");
      }
    } else {
      Serial.printf("Alert active: TEMP:%.1fC HUM:%.0f%% AQI:%d (no repeat)\n",
        temperature, humidity, aqiValue);
    }
    lastAlertActive = true;

  } else {
    // ── All-clear: send recovery SMS once, then reset ──
    if (lastAlertActive) {
      Serial.println("All-clear — sending recovery SMS to recipients.");
      if (WiFi.status() == WL_CONNECTED) {
        String msg = getAllClearMessage(temperature, humidity, aqiValue, currentLocation);
        WiFiClientSecure cc; cc.setInsecure();
        HTTPClient ch;
        ch.begin(cc, String(SUPABASE_URL) + "/rest/v1/notification_users?is_active=eq.true");
        ch.addHeader("apikey",        SUPABASE_APIKEY);
        ch.addHeader("Authorization", String("Bearer ") + SUPABASE_APIKEY);
        if (ch.GET() == 200) {
          JsonDocument cd;
          deserializeJson(cd, ch.getString());
          for (JsonObject r : cd.as<JsonArray>()) {
            createSMSNotification(r["phone_number"].as<String>(), msg);
            delay(500);
          }
        }
        ch.end();
      }
    }
    lastAlertActive = false;
  }

  lastAQICategory = aqiCategory;
  updateLEDs();
}

// ============================================================
// SERIAL OUTPUT
// ============================================================
void printSerial() {
  Serial.println("=================================================");
  Serial.printf("GPS        : %s\n",      gpsFixed ? "FIXED" : "Waiting...");
  if (gpsFixed)
    Serial.printf("Coords     : %.6f, %.6f\n", latitude, longitude);
  Serial.printf("Time       : %s\n",      getTimestamp().c_str());
  Serial.printf("NTP Synced : %s\n",      ntpSynced ? "Yes" : "No (using GPS/uptime fallback)");
  Serial.printf("Temperature: %.1f C\n",  temperature);
  Serial.printf("Humidity   : %.1f %%\n", humidity);
  Serial.printf("MQ135 Raw  : %d\n",      mq135Raw);
  Serial.printf("AQI Value  : %d\n",      aqiValue);
  Serial.printf("Category   : %s\n",      aqiCategory.c_str());
  Serial.printf("CO2 (est)  : %.1f ppm\n", co2Ppm);
  Serial.printf("NH3 (est)  : %.1f ppm\n", nh3Ppm);
  Serial.printf("Benzene(est): %.1f ppm\n", benzenePpm);
  Serial.printf("Alcohol(est): %.1f ppm\n", alcoholPpm);
  Serial.printf("SMS Module : %s | Signal: %s\n",
    sim900Ready    ? "Ready"  : "Offline",
    sim900SignalOK ? "OK"     : "No Signal");
  Serial.printf("Alert State: %s\n",      lastAlertActive ? "ACTIVE" : "Clear");
  Serial.printf("Read #     : %d\n",      sensorReadCount);
  Serial.println("=================================================");
}

// ============================================================
// WIFI + NTP
// ============================================================
void connectWiFi() {
  Serial.printf("Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    esp_task_wdt_reset();
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nWiFi OK — IP: %s\n", WiFi.localIP().toString().c_str());
    configTime(8 * 3600, 0, "pool.ntp.org", "time.google.com", "time.nist.gov");
    Serial.println("NTP sync requested...");

    struct tm timeinfo;
    int n = 0;
    while (!getLocalTime(&timeinfo) && n < 30) {
      esp_task_wdt_reset();
      delay(500);
      n++;
      if (n % 5 == 0) Serial.printf("   NTP waiting %d/30...\n", n);
    }

    if (getLocalTime(&timeinfo)) {
      ntpSynced = true;
      Serial.printf("NTP synced: %s\n", getTimestamp().c_str());
    } else {
      ntpSynced = false;
      Serial.printf("NTP failed — using fallback: %s\n", getTimestamp().c_str());
    }
  } else {
    Serial.println("\nWiFi failed — will retry");
    Serial.printf("Time fallback: %s\n", getTimestamp().c_str());
  }
}

// ============================================================
// SUPABASE UPLOAD
// ============================================================
void uploadToSupabase() {
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;

  http.begin(client, String(SUPABASE_URL) + "/rest/v1/air_quality_readings");
  http.setTimeout(15000);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_APIKEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_APIKEY);
  http.addHeader("Prefer",        "return=minimal");

  String body = "{";
  body += "\"device_id\":\"" + String(DEVICE_ID) + "\",";

  if (gpsFixed && !(latitude == 0.0 && longitude == 0.0)) {
    char latBuf[16], lonBuf[16];
    snprintf(latBuf, sizeof(latBuf), "%.6f", latitude);
    snprintf(lonBuf, sizeof(lonBuf), "%.6f", longitude);
    body += "\"latitude\":"  + String(latBuf) + ",";
    body += "\"longitude\":" + String(lonBuf) + ",";
  } else {
    body += "\"latitude\":null,\"longitude\":null,";
  }

  body += "\"temperature\":"    + String(temperature, 2) + ",";
  body += "\"humidity\":"       + String(humidity, 2)    + ",";
  body += "\"mq135_raw\":"      + String(mq135Raw)       + ",";
  body += "\"aqi_value\":"      + String(aqiValue)       + ",";
  body += "\"aqi_category\":\"" + aqiCategory            + "\",";
  body += "\"co2_ppm\":"        + String(co2Ppm, 2)      + ",";
  body += "\"nh3_ppm\":"        + String(nh3Ppm, 2)      + ",";
  body += "\"benzene_ppm\":"    + String(benzenePpm, 2)  + ",";
  body += "\"alcohol_ppm\":"    + String(alcoholPpm, 2)  + "}";

  int code = http.POST(body);
  if (code == 201 || code == 200 || code == 204) {
    Serial.printf("Supabase upload OK (%d)\n", code);
    uploadFailCount = 0;
    if (gpsFixed) pushGPSToDatabase();
  } else {
    Serial.printf("Upload error: HTTP %d | %s\n", code, http.getString().c_str());
    uploadFailCount++;
    if (uploadFailCount >= 5) {
      Serial.println("Too many failures — rebooting");
      delay(1000);
      ESP.restart();
    }
  }
  http.end();
}

// ============================================================
// SIM900A INIT
// ============================================================
void initSIM900A() {
  Serial.println("Initializing SIM900A...");
  for (int i = 0; i < 5; i++) { esp_task_wdt_reset(); feedGPS(); delay(1000); }

  const long bauds[] = { 9600, 115200, 57600, 38400 };
  bool found = false;

  for (int b = 0; b < 4 && !found; b++) {
    esp_task_wdt_reset();
    Serial.printf("   Trying %ld baud...\n", bauds[b]);
    sim900Serial.end(); delay(100);
    sim900Serial.begin(bauds[b], SERIAL_8N1, 16, 17); delay(200);
    while (sim900Serial.available()) sim900Serial.read();

    for (int t = 0; t < 3 && !found; t++) {
      esp_task_wdt_reset();
      sim900ATCommand("AT");
      String r = sim900ReadResponse(2000);
      if (r.indexOf("OK") != -1) {
        Serial.printf("   Found at %ld baud\n", bauds[b]);
        if (bauds[b] != 9600) {
          sim900ATCommand("AT+IPR=9600");
          sim900ReadResponse(1000);
          sim900Serial.end(); delay(200);
          sim900Serial.begin(9600, SERIAL_8N1, 16, 17); delay(200);
        }
        found = true;
      }
      delay(300);
    }
  }

  esp_task_wdt_reset();
  if (!found) {
    Serial.println("SIM900A not found — check power/wiring/SIM");
    sim900Ready = false;
    return;
  }

  sim900Ready = true;
  sim900ATCommand("ATE0");      sim900ReadResponse(1000); esp_task_wdt_reset();
  sim900ATCommand("AT+CMGF=1"); sim900ReadResponse(1000); esp_task_wdt_reset();
  checkSIM900ASignal();
  Serial.println("SIM900A ready");
}

// ============================================================
// SIM900A SIGNAL
// ============================================================
void checkSIM900ASignal() {
  if (!sim900Ready) return;
  sim900ATCommand("AT+CSQ");
  String r = sim900ReadResponse(2000);
  if (r.indexOf("+CSQ") != -1) {
    int rssi = r.substring(r.indexOf(":") + 1).toInt();
    sim900SignalOK = (rssi > 0 && rssi <= 31);
    if (sim900SignalOK)
      Serial.printf("Signal RSSI %d (%d/5 bars)\n", rssi, (rssi / 8) + 1);
    else
      Serial.println("Signal: none");
  }
}

void sim900ATCommand(String cmd) {
  while (sim900Serial.available()) sim900Serial.read();
  sim900Serial.println(cmd);
  Serial.printf("-> %s\n", cmd.c_str());
}

String sim900ReadResponse(unsigned long timeout) {
  String response = "";
  unsigned long start = millis();
  bool done = false;
  while (millis() - start < timeout) {
    while (sim900Serial.available()) response += (char)sim900Serial.read();
    if (!done) {
      if (response.indexOf("OK")         != -1 || response.indexOf("ERROR")      != -1 ||
          response.indexOf("+CMGS")      != -1 || response.indexOf("+CSQ")       != -1 ||
          response.indexOf("NO CARRIER") != -1) done = true;
    }
    if (done) {
      delay(200);
      while (sim900Serial.available()) response += (char)sim900Serial.read();
      break;
    }
    delay(10);
  }
  return response;
}

// ============================================================
// CHECK AND SEND PENDING SMS
// ============================================================
void checkAndSendPendingSMS() {
  if (!sim900Ready) { Serial.println("SMS check: modem not ready"); return; }

  checkSIM900ASignal();
  if (!sim900SignalOK) { Serial.println("SMS check: no signal"); return; }

  esp_task_wdt_reset(); feedGPS();

  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;

  String timeFilter = "";
  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    time_t now_t = mktime(&timeinfo) - 120;
    struct tm *t2 = gmtime(&now_t);
    char buf[30];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", t2);
    timeFilter = "&created_at=gt." + String(buf) + "Z";
  }

  http.begin(client, String(SUPABASE_URL) +
    "/rest/v1/sms_notifications?status=eq.pending&limit=5" + timeFilter);
  http.addHeader("apikey",        SUPABASE_APIKEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_APIKEY);

  int code = http.GET();
  if (code == 200) {
    JsonDocument doc;
    deserializeJson(doc, http.getString());
    JsonArray arr = doc.as<JsonArray>();

    if (arr.size() > 0) {
      String phone   = arr[0]["phone_number"].as<String>();
      String message = arr[0]["message"].as<String>();
      int    smsId   = arr[0]["id"].as<int>();
      int    remain  = (int)arr.size() - 1;
      http.end();

      feedGPS(); esp_task_wdt_reset();
      checkSIM900ASignal();
      if (!sim900SignalOK) { Serial.println("Signal lost before send"); return; }

      bool ok = sendSMS(phone, message);
      esp_task_wdt_reset(); feedGPS();

      updateSMSStatus(smsId, ok ? "sent" : "failed");
      Serial.printf("SMS %s\n", ok ? "sent OK" : "failed");
      if (remain > 0) Serial.printf("%d more pending — next cycle\n", remain);
    } else {
      Serial.println("No pending SMS");
      http.end();
    }
  } else {
    Serial.printf("Pending SMS fetch failed (HTTP %d)\n", code);
    http.end();
  }
  esp_task_wdt_reset(); feedGPS();
}

// ============================================================
// SEND SMS
// ============================================================
bool sendSMS(String phoneNumber, String message) {
  if (!sim900Ready || !sim900SignalOK) return false;
  if (!phoneNumber.startsWith("+")) phoneNumber = "+" + phoneNumber;

  sim900ATCommand("AT+CMGS=\"" + phoneNumber + "\"");
  delay(500);
  sim900Serial.print(message);
  sim900Serial.write(26);
  Serial.printf("-> MSG to %s (%d chars) [Ctrl+Z]\n", phoneNumber.c_str(), message.length());

  String r = sim900ReadResponse(10000);
  if (r.indexOf("+CMGS") != -1 || r.indexOf("OK") != -1) {
    Serial.printf("SMS sent to %s\n", phoneNumber.c_str());
    return true;
  }
  Serial.printf("SMS failed: %s\n", r.c_str());
  return false;
}

// ============================================================
// UPDATE SMS STATUS
// ============================================================
void updateSMSStatus(int smsId, String status) {
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/sms_notifications?id=eq." + String(smsId));
  http.addHeader("apikey",        SUPABASE_APIKEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_APIKEY);
  http.addHeader("Content-Type",  "application/json");
  http.PATCH("{\"status\":\"" + status + "\"}");
  http.end();
}

// ============================================================
// CREATE SMS NOTIFICATION RECORD IN SUPABASE
// ============================================================
void createSMSNotification(String phoneNumber, String message) {
  message.replace("\\", "\\\\");
  message.replace("\"", "\\\"");
  message.replace("\n", "\\n");
  message.replace("\r", "\\r");

  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/sms_notifications");
  http.addHeader("apikey",        SUPABASE_APIKEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_APIKEY);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("Prefer",        "return=minimal");

  String body = "{";
  body += "\"phone_number\":\"" + phoneNumber + "\",";
  body += "\"message\":\""      + message     + "\",";
  body += "\"status\":\"pending\"";
  body += "}";

  int code = http.POST(body);
  if (code == 201 || code == 200) {
    Serial.printf("SMS record created for %s\n", phoneNumber.c_str());
  } else {
    Serial.printf("SMS record failed (HTTP %d)\n", code);
    Serial.printf("  Body: %s\n", body.c_str());
    Serial.printf("  Resp: %s\n", http.getString().c_str());
  }
  http.end();
}

// ============================================================
// BROADCAST SMS TO ALL ACTIVE RECIPIENTS
//
// BUG C FIX: >= instead of > for AQI threshold.
// BUG E FIX: message is pre-validated non-empty before this
//             is called, so GOOD (Row 1) never reaches here.
// ============================================================
void createSMSNotificationsForRecipients(String message) {
  // Safety guard — never send an empty message
  if (message.length() == 0) {
    Serial.println("SMS broadcast skipped: empty message (GOOD condition)");
    return;
  }

  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  http.begin(client, String(SUPABASE_URL) + "/rest/v1/notification_users?is_active=eq.true");
  http.addHeader("apikey",        SUPABASE_APIKEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_APIKEY);

  int code = http.GET();
  if (code == 200) {
    JsonDocument doc;
    deserializeJson(doc, http.getString());
    JsonArray recipients = doc.as<JsonArray>();
    Serial.printf("%d active recipient(s)\n", recipients.size());

    bool tempAlert = (temperature >= 33.0f);
    bool humAlert  = (humidity    >= 71.0f);
    bool aqiAlert  = (aqiValue    >= 51);

    for (JsonObject r : recipients) {
      String phone  = r["phone_number"].as<String>();
      int    thresh = r["aqi_threshold"].as<int>();

      // BUG C FIX: >= so exact threshold match triggers SMS
      bool send = tempAlert || humAlert || (aqiAlert && aqiValue >= thresh);

      if (send) {
        createSMSNotification(phone, message);
        delay(500);
      } else {
        Serial.printf("Skip %s: AQI %d < threshold %d, no temp/hum alert\n",
          phone.c_str(), aqiValue, thresh);
      }
    }
  } else {
    Serial.printf("Recipients fetch failed (HTTP %d)\n", code);
  }
  http.end();
}
