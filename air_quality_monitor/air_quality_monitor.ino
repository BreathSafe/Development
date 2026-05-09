/*
 ============================================================
  AIR QUALITY MONITOR — ESP32 + DHT11 + MQ135 + SIM900
  Dashboard → Supabase REST API + SMS Alerts via SIM900
 ============================================================
  WIRING SUMMARY
  ──────────────────────────────────────────────────────────
  DHT11
    VCC  → 3.3V
    GND  → GND
    DATA → GPIO 4  (with 10kΩ pull-up to 3.3V)

  MQ135
    VCC  → 5V  (use Vin pin on ESP32 devboard)
    GND  → GND
    AO   → GPIO 34  (ADC1 — input only, no pull-up)
    DO   → not used

  LEDs  (each with a 220Ω resistor in series to GND)
    Green  → GPIO 25
    Yellow → GPIO 26
    Red    → GPIO 27

  SIM900 GSM Module
    VCC  → 5V (external power recommended)
    GND  → GND
    TX   → GPIO 16 (RX2 on ESP32)
    RX   → GPIO 17 (TX2 on ESP32)
  ============================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ── WiFi credentials ──────────────────────────────────────
const char* WIFI_SSID     = "Chichi";
const char* WIFI_PASSWORD = "12345678";

// ── Supabase credentials ──────────────────────────────────
const char* SUPABASE_URL    = "https://hqptxgzpzuhsrybuyjoy.supabase.co";
const char* SUPABASE_APIKEY = "sb_publishable_Vn85SyMOd3cToHzCliO5Jg_AX2BO_xY";
// Table: air_quality_readings

// ── Pin definitions ───────────────────────────────────────
#define DHT_PIN       4
#define DHT_TYPE      DHT11
#define MQ135_PIN     34    // ADC1_CH6
#define LED_GREEN     25
#define LED_YELLOW    26
#define LED_RED       27

// ── Timing ────────────────────────────────────────────────
const unsigned long READ_INTERVAL   = 10000;  // 10 s sensor read
const unsigned long UPLOAD_INTERVAL = 30000;  // 30 s upload to Supabase

// ── MQ135 calibration (adjust after warm-up) ──────────────
// Raw ADC range: 0–4095 (12-bit)
// Thresholds below are approximate; calibrate in clean air.
const int AQI_GOOD_MAX     = 800;   // 0–800   → Good
const int AQI_MODERATE_MAX = 1800;  // 801–1800→ Moderate
                                    // >1800   → Unhealthy

// ── Device Identification ────────────────────────────────
const char* DEVICE_ID = "AW-001";

// ── GPS Configuration (TinyGPS++ & SoftwareSerial) ────────
#include <TinyGPS++.h>
#include <SoftwareSerial.h>

#define GPS_RX_PIN 16  // Connect to GPS TX
#define GPS_TX_PIN 17  // Connect to GPS RX
TinyGPSPlus gps;
SoftwareSerial gpsSerial(GPS_RX_PIN, GPS_TX_PIN);

// ── MQ135 Sensitivity Constants (from datasheet curves) ────
// Formula: PPM = a * (Rs/Ro)^b
const float MQ135_CO2_A     = 110.47, MQ135_CO2_B     = -2.862;
const float MQ135_NH3_A     = 102.2,  MQ135_NH3_B     = -2.473;
const float MQ135_BENZENE_A = 44.947, MQ135_BENZENE_B = -3.445;
const float MQ135_ALCOHOL_A = 77.255, MQ135_ALCOHOL_B = -3.18;
float Ro = 10.0; // Standard baseline resistance (kOhm) in clean air

// ── Global Variables ──────────────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);
float temperature = 0, humidity = 0;
int   mq135Raw    = 0;
float co2Ppm = 0, nh3Ppm = 0, benzenePpm = 0, alcoholPpm = 0;
int   aqiValue    = 0;
String aqiCategory = "Good";
double latitude   = 8.4542, longitude = 124.6319;
unsigned long lastRead   = 0;
unsigned long lastUpload = 0;

// ─────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600); // Most GPS modules default to 9600 baud

  // LED pins
  pinMode(LED_GREEN,  OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED,    OUTPUT);

  // Startup blink — all LEDs on
  digitalWrite(LED_GREEN,  HIGH);
  digitalWrite(LED_YELLOW, HIGH);
  digitalWrite(LED_RED,    HIGH);
  delay(800);
  digitalWrite(LED_GREEN,  LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED,    LOW);

  // Init DHT
  dht.begin();

  // MQ135 warm-up notice
  Serial.println("⏳  MQ135 warming up — please wait 30 s...");
  for (int i = 30; i > 0; i--) {
    Serial.printf("   %d s remaining\n", i);
    delay(1000);
  }
  Serial.println("✅  MQ135 ready.");

  // Connect WiFi
  connectWiFi();
  logHardwareActivity("success", "System boot complete. Device " + String(DEVICE_ID) + " online.");
}

// ─────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // Read GPS data constantly
  while (gpsSerial.available() > 0) {
    if (gps.encode(gpsSerial.read())) {
      if (gps.location.isValid()) {
        latitude  = gps.location.lat();
        longitude = gps.location.lng();
      }
    }
  }

  // ── Read sensors every READ_INTERVAL ──────────────────
  if (now - lastRead >= READ_INTERVAL) {
    lastRead = now;
    readSensors();
    printSerial();
  }

  // ── Upload to Supabase every UPLOAD_INTERVAL ──────────
  if (now - lastUpload >= UPLOAD_INTERVAL) {
    lastUpload = now;
    if (WiFi.status() != WL_CONNECTED) connectWiFi();
    uploadToSupabase();
  }
}

// ── Remote Logging to Dashboard ──────────────────────────
void logHardwareActivity(String type, String message) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  WiFiClientSecure client;
  client.setInsecure(); // Skip SSL certificate verification for Supabase
  
  HTTPClient http;
  String endpoint = String(SUPABASE_URL) + "/rest/v1/system_activity";
  
  http.begin(client, endpoint);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_APIKEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_APIKEY);
  
  StaticJsonDocument<256> doc;
  doc["type"]      = type;      // info, success, warn, danger
  doc["category"]  = "hardware";
  doc["message"]   = message;
  doc["actor"]     = DEVICE_ID;
  doc["device_id"] = DEVICE_ID;
  
  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  http.end();
}

// ── Gas Concentration Calculations ──────────────────────
float getRs(int rawAdc) {
  float vOut = rawAdc * (3.3 / 4095.0);
  float rs = (3.3 - vOut) / vOut * 10.0; // 10k load resistor
  return rs;
}

float calculatePPM(float rs_ro, float a, float b) {
  return a * pow(rs_ro, b);
}

// ─────────────────────────────────────────────────────────
void readSensors() {
  // DHT11
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t)) temperature = t;
  if (!isnan(h)) humidity = h;

  // MQ135
  mq135Raw = analogRead(MQ135_PIN);
  
  // Calculate specific gas concentrations
  float rs = getRs(mq135Raw);
  float ratio = rs / Ro;
  
  co2Ppm     = calculatePPM(ratio, MQ135_CO2_A, MQ135_CO2_B) + 400; // +400 for atmospheric baseline
  nh3Ppm     = calculatePPM(ratio, MQ135_NH3_A, MQ135_NH3_B);
  benzenePpm = calculatePPM(ratio, MQ135_BENZENE_A, MQ135_BENZENE_B);
  alcoholPpm = calculatePPM(ratio, MQ135_ALCOHOL_A, MQ135_ALCOHOL_B);

  // Map to AQI (Calibrated for lower sensitivity)
  aqiValue = map(mq135Raw, 150, 2500, 0, 300);
  if (aqiValue < 0) aqiValue = 0;
  
  if (aqiValue <= AQI_GOOD_MAX) aqiCategory = "Good";
  else if (aqiValue <= AQI_MODERATE_MAX) aqiCategory = "Moderate";
  else aqiCategory = "Unhealthy";
  
  updateLEDs();
}

// ─────────────────────────────────────────────────────────
void updateLEDs() {
  digitalWrite(LED_GREEN,  LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED,    LOW);

  if (aqiCategory == "Good") {
    digitalWrite(LED_GREEN, HIGH);
  } else if (aqiCategory == "Moderate") {
    digitalWrite(LED_YELLOW, HIGH);
  } else {
    // Blink red for Unhealthy
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
  Serial.printf("📍  Location    : %.6f, %.6f\n", latitude, longitude);
  Serial.printf("🌡  Temperature : %.1f °C\n",  temperature);
  Serial.printf("💧  Humidity    : %.1f %%\n",  humidity);
  Serial.printf("🌫  MQ135 Raw   : %d\n",        mq135Raw);
  Serial.printf("💨  CO2 Est.    : %.1f ppm\n",  co2Ppm);
  Serial.printf("🧪  NH3 Est.    : %.1f ppm\n",  nh3Ppm);
  Serial.printf("🧪  Benzene Est.: %.1f ppm\n",  benzenePpm);
  Serial.printf("📊  AQI Value   : %d\n",        aqiValue);
  Serial.printf("🏷  Category    : %s\n",        aqiCategory.c_str());
  
  // Display potential gases detected by MQ135 if air quality is degraded
  if (aqiCategory != "Good") {
    Serial.println("⚠️  Detected Pollutants: NH3, NOx, Alcohol, Benzene, Smoke, CO2");
  } else {
    Serial.println("🍃  Air Quality: Stable");
  }
  
  Serial.println("─────────────────────────────");
}

// ─────────────────────────────────────────────────────────
void uploadToSupabase() {
  WiFiClientSecure client;
  client.setInsecure(); // Skip SSL certificate verification
  
  HTTPClient http;
  String endpoint = String(SUPABASE_URL) + "/rest/v1/air_quality_readings";

  http.begin(client, endpoint);
  http.setTimeout(10000); // 10s timeout
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
    logHardwareActivity("info", "New data point uploaded: AQI " + String(aqiValue));
  } else {
    Serial.printf("❌  Supabase error: HTTP %d\n", code);
    if (code == -1) Serial.println("⚠️  Check WiFi connection or SSL settings.");
    logHardwareActivity("danger", "Upload failed: HTTP " + String(code));
    Serial.println(http.getString());
  }
  http.end();
}

// ─────────────────────────────────────────────────────────
void connectWiFi() {
  Serial.printf("📶  Connecting to %s ", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n✅  WiFi connected — IP: %s\n",
                  WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n❌  WiFi failed — will retry next upload cycle.");
  }
}
