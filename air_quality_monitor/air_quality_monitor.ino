/*
 ============================================================
  AIR QUALITY MONITOR — ESP32 + DHT11 + MQ135 + GPS NEO-6M
  Supabase REST API upload
 ============================================================
  WIRING
  DHT11   DATA → GPIO 4
  MQ135   AO   → GPIO 34
  LED Green    → GPIO 25
  LED Yellow   → GPIO 26
  LED Red      → GPIO 27
  GPS TX       → GPIO 18 (ESP32 RX1)
  GPS RX       → GPIO 19 (ESP32 TX1)
  SIM900 TX    → GPIO 16 (ESP32 RX2)
  SIM900 RX    → GPIO 17 (ESP32 TX2)
 ============================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <TinyGPS++.h>

// ── WiFi ──────────────────────────────────────────────────
const char* WIFI_SSID     = "Chichi";
const char* WIFI_PASSWORD = "12345678";

// ── Supabase ──────────────────────────────────────────────
const char* SUPABASE_URL    = "https://hqptxgzpzuhsrybuyjoy.supabase.co";
const char* SUPABASE_APIKEY = "sb_publishable_Vn85SyMOd3cToHzCliO5Jg_AX2BO_xY";

// ── Device ID ─────────────────────────────────────────────
const char* DEVICE_ID = "AW-001";

// ── Pins ──────────────────────────────────────────────────
#define DHT_PIN    4
#define DHT_TYPE   DHT11
#define MQ135_PIN  34
#define LED_GREEN  25
#define LED_YELLOW 26
#define LED_RED    27

// ── Serial ports ──────────────────────────────────────────
// HardwareSerial — correct for ESP32, NOT SoftwareSerial
HardwareSerial gpsSerial(1);   // UART1 → GPS  (RX=18, TX=19)
HardwareSerial simSerial(2);   // UART2 → SIM900A (RX=16, TX=17)

// ── GPS ───────────────────────────────────────────────────
TinyGPSPlus gps;
double latitude  = 8.4542;   // default fallback coords
double longitude = 124.6319;
bool   gpsFixed  = false;

// ── MQ135 calibration ─────────────────────────────────────
const int AQI_GOOD_MAX     = 800;
const int AQI_MODERATE_MAX = 1800;
const float Ro = 10.0;

const float MQ135_CO2_A     = 110.47, MQ135_CO2_B     = -2.862;
const float MQ135_NH3_A     = 102.2,  MQ135_NH3_B     = -2.473;
const float MQ135_BENZENE_A = 44.947, MQ135_BENZENE_B = -3.445;
const float MQ135_ALCOHOL_A = 77.255, MQ135_ALCOHOL_B = -3.18;

// ── Globals ───────────────────────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);
float  temperature = 0, humidity = 0;
int    mq135Raw    = 0, aqiValue = 0;
float  co2Ppm = 0, nh3Ppm = 0, benzenePpm = 0, alcoholPpm = 0;
String aqiCategory = "Good";

const unsigned long READ_INTERVAL   = 10000;
const unsigned long UPLOAD_INTERVAL = 30000;
unsigned long lastRead = 0, lastUpload = 0;

// ─────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // ✅ HardwareSerial with explicit pins
  gpsSerial.begin(9600,  SERIAL_8N1, 18, 19); // GPS  RX=18 TX=19
  simSerial.begin(9600,  SERIAL_8N1, 16, 17); // SIM  RX=16 TX=17

  pinMode(LED_GREEN,  OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED,    OUTPUT);

  // Startup blink
  digitalWrite(LED_GREEN, HIGH);
  digitalWrite(LED_YELLOW, HIGH);
  digitalWrite(LED_RED, HIGH);
  delay(800);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED, LOW);

  dht.begin();

  Serial.println("⏳  MQ135 warming up — 30 s...");
  for (int i = 30; i > 0; i--) {
    // Feed GPS during warm-up so it starts getting a fix early
    while (gpsSerial.available()) gps.encode(gpsSerial.read());
    Serial.printf("   %d s remaining\n", i);
    delay(1000);
  }
  Serial.println("✅  MQ135 ready.");

  connectWiFi();
}

// ─────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // Feed GPS continuously
  while (gpsSerial.available() > 0) {
    if (gps.encode(gpsSerial.read())) {
      if (gps.location.isValid()) {
        latitude  = gps.location.lat();
        longitude = gps.location.lng();
        gpsFixed  = true;
      }
    }
  }

  if (now - lastRead >= READ_INTERVAL) {
    lastRead = now;
    readSensors();
    printSerial();
  }

  if (now - lastUpload >= UPLOAD_INTERVAL) {
    lastUpload = now;
    if (WiFi.status() != WL_CONNECTED) connectWiFi();
    uploadToSupabase();
  }
}

// ─────────────────────────────────────────────────────────
float getRs(int rawAdc) {
  float vOut = rawAdc * (3.3f / 4095.0f);
  if (vOut <= 0) vOut = 0.001; // prevent divide by zero
  return (3.3f - vOut) / vOut * 10.0f;
}

float calculatePPM(float rs_ro, float a, float b) {
  return a * pow(rs_ro, b);
}

// ─────────────────────────────────────────────────────────
void readSensors() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) temperature = t;
  if (!isnan(h)) humidity    = h;

  // Average 10 samples for stable MQ135 reading
  long sum = 0;
  for (int i = 0; i < 10; i++) { sum += analogRead(MQ135_PIN); delay(5); }
  mq135Raw = sum / 10;

  float rs    = getRs(mq135Raw);
  float ratio = rs / Ro;

  co2Ppm     = calculatePPM(ratio, MQ135_CO2_A,     MQ135_CO2_B)     + 400;
  nh3Ppm     = calculatePPM(ratio, MQ135_NH3_A,     MQ135_NH3_B);
  benzenePpm = calculatePPM(ratio, MQ135_BENZENE_A, MQ135_BENZENE_B);
  alcoholPpm = calculatePPM(ratio, MQ135_ALCOHOL_A, MQ135_ALCOHOL_B);

  aqiValue = map(mq135Raw, 150, 2500, 0, 300);
  if (aqiValue < 0) aqiValue = 0;

  if      (mq135Raw <= AQI_GOOD_MAX)     aqiCategory = "Good";
  else if (mq135Raw <= AQI_MODERATE_MAX) aqiCategory = "Moderate";
  else                                    aqiCategory = "Unhealthy";

  updateLEDs();
}

// ─────────────────────────────────────────────────────────
void updateLEDs() {
  digitalWrite(LED_GREEN,  LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED,    LOW);

  if      (aqiCategory == "Good")     digitalWrite(LED_GREEN,  HIGH);
  else if (aqiCategory == "Moderate") digitalWrite(LED_YELLOW, HIGH);
  else {
    for (int i = 0; i < 3; i++) {
      digitalWrite(LED_RED, HIGH); delay(150);
      digitalWrite(LED_RED, LOW);  delay(150);
    }
    digitalWrite(LED_RED, HIGH);
  }
}

// ─────────────────────────────────────────────────────────
void printSerial() {
  Serial.println("─────────────────────────────");
  Serial.printf("📍  GPS Fix     : %s\n",        gpsFixed ? "YES" : "Waiting...");
  Serial.printf("📍  Location    : %.6f, %.6f\n", latitude, longitude);
  Serial.printf("🌡  Temperature : %.1f °C\n",   temperature);
  Serial.printf("💧  Humidity    : %.1f %%\n",   humidity);
  Serial.printf("🌫  MQ135 Raw   : %d\n",         mq135Raw);
  Serial.printf("💨  CO2 Est.    : %.1f ppm\n",  co2Ppm);
  Serial.printf("🧪  NH3 Est.    : %.1f ppm\n",  nh3Ppm);
  Serial.printf("🧪  Benzene     : %.1f ppm\n",  benzenePpm);
  Serial.printf("📊  AQI Value   : %d\n",         aqiValue);
  Serial.printf("🏷  Category    : %s\n",         aqiCategory.c_str());
  Serial.println("─────────────────────────────");
}

// ─────────────────────────────────────────────────────────
void uploadToSupabase() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String endpoint = String(SUPABASE_URL) + "/rest/v1/air_quality_readings";

  http.begin(client, endpoint);
  http.setTimeout(10000);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_APIKEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_APIKEY);
  http.addHeader("Prefer",        "return=minimal");

  StaticJsonDocument<512> doc;
  doc["device_id"]    = DEVICE_ID;
  doc["latitude"]     = latitude;
  doc["longitude"]    = longitude;
  doc["temperature"]  = temperature;
  doc["humidity"]     = humidity;
  doc["mq135_raw"]    = mq135Raw;
  doc["aqi_value"]    = aqiValue;
  doc["aqi_category"] = aqiCategory;
  doc["co2_ppm"]      = co2Ppm;
  doc["nh3_ppm"]      = nh3Ppm;
  doc["benzene_ppm"]  = benzenePpm;
  doc["alcohol_ppm"]  = alcoholPpm;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code == 201 || code == 200 || code == 204) {
    Serial.printf("☁️  Supabase upload OK (%d)\n", code);
  } else {
    Serial.printf("❌  Supabase error: HTTP %d\n", code);
    Serial.println(http.getString());
  }
  http.end();
}

// ─────────────────────────────────────────────────────────
void connectWiFi() {
  Serial.printf("📶  Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500); Serial.print("."); attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n✅  WiFi connected — IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n❌  WiFi failed — will retry.");
  }
}