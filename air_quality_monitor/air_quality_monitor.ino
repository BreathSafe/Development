/*
 ============================================================
  AIR QUALITY MONITOR — ESP32 + DHT11 + MQ135
  Dashboard → Supabase REST API
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
  ============================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
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

// ── Globals ───────────────────────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);

float temperature   = 0;
float humidity      = 0;
int   mq135Raw      = 0;
int   aqiValue      = 0;      // mapped 0–500 (simplified AQI)
String aqiCategory  = "Good";

unsigned long lastRead   = 0;
unsigned long lastUpload = 0;

// ─────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

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
}

// ─────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // ── Read sensors every READ_INTERVAL ──────────────────
  if (now - lastRead >= READ_INTERVAL) {
    lastRead = now;
    readSensors();
    updateLEDs();
    printSerial();
  }

  // ── Upload to Supabase every UPLOAD_INTERVAL ──────────
  if (now - lastUpload >= UPLOAD_INTERVAL) {
    lastUpload = now;
    if (WiFi.status() != WL_CONNECTED) connectWiFi();
    uploadToSupabase();
  }
}

// ─────────────────────────────────────────────────────────
void readSensors() {
  // DHT11
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (!isnan(h) && !isnan(t)) {
    humidity    = h;
    temperature = t;
  } else {
    Serial.println("⚠️  DHT11 read failed — keeping last values.");
  }

  // MQ135 — average 10 samples to reduce noise
  long sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(MQ135_PIN);
    delay(5);
  }
  mq135Raw = sum / 10;

  // Map raw ADC (0–4095) to simplified AQI (0–500)
  aqiValue = map(mq135Raw, 0, 4095, 0, 500);

  // Categorise
  if (mq135Raw <= AQI_GOOD_MAX) {
    aqiCategory = "Good";
  } else if (mq135Raw <= AQI_MODERATE_MAX) {
    aqiCategory = "Moderate";
  } else {
    aqiCategory = "Unhealthy";
  }
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
  Serial.printf("🌡  Temperature : %.1f °C\n",  temperature);
  Serial.printf("💧  Humidity    : %.1f %%\n",  humidity);
  Serial.printf("🌫  MQ135 Raw   : %d\n",        mq135Raw);
  Serial.printf("📊  AQI Value   : %d\n",        aqiValue);
  Serial.printf("🏷  Category    : %s\n",        aqiCategory.c_str());
  Serial.println("─────────────────────────────");
}

// ─────────────────────────────────────────────────────────
void uploadToSupabase() {
  HTTPClient http;
  String endpoint = String(SUPABASE_URL) + "/rest/v1/air_quality_readings";

  http.begin(endpoint);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_APIKEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_APIKEY);
  http.addHeader("Prefer",        "return=minimal");

  // Build JSON payload
  StaticJsonDocument<256> doc;
  doc["temperature"]   = temperature;
  doc["humidity"]      = humidity;
  doc["mq135_raw"]     = mq135Raw;
  doc["aqi_value"]     = aqiValue;
  doc["aqi_category"]  = aqiCategory;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code == 201) {
    Serial.println("☁️  Supabase upload OK (201)");
  } else {
    Serial.printf("❌  Supabase error: HTTP %d\n", code);
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
