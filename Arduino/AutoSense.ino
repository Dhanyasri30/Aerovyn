/**
 * ============================================================================
 * AutoSense — Smart Automotive Gas, Smoke & Air-Quality Monitoring System
 * Single-File Self-Contained Arduino Uno Firmware Sketch
 * ============================================================================
 * Board: Arduino Uno (ATmega328P @ 16 MHz, 5V Logic)
 * 
 * Hardware Connections:
 * 1. MQ-2 Combustible Gas & Smoke Sensor  -> Analog Pin A0 (0–5V)
 * 2. MQ-135 General Air-Quality Sensor     -> Analog Pin A1 (0–5V)
 * 3. DHT22 Temperature & Humidity Sensor   -> Digital Pin D2 (with 10k pullup to 5V)
 * 4. SSD1306 I2C OLED Display (128x64)     -> SDA: Pin A4, SCL: Pin A5 (Addr: 0x3C)
 * 5. Buzzer (Local Audio Alert)            -> Digital Pin D8
 * 
 * (Physical LEDs have been removed as requested; alerts are displayed visually 
 *  on the OLED Header/Footer and sounded through the Pin D8 Buzzer).
 * 
 * Required Libraries (Install via Arduino Library Manager):
 * - "DHT sensor library" by Adafruit
 * - "Adafruit Unified Sensor" by Adafruit
 * - "Adafruit SSD1306" by Adafruit
 * - "Adafruit GFX Library" by Adafruit
 * ============================================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>

// ============================================================================
// 1. PIN CONFIGURATION & CONSTANTS
// ============================================================================
// Analog Inputs (5V Logic)
#define PIN_MQ2             A0    // MQ-2 Smoke & Combustible Gas Analog Out
#define PIN_MQ135           A1    // MQ-135 General Air Quality Analog Out

// Digital Pins
#define PIN_DHT22           2     // DHT22 Digital Temperature & Humidity Data
#define PIN_BUZZER          8     // Single Local Alarm Buzzer (Pin D8)

// OLED Display Configuration (128x64 I2C)
#define SCREEN_WIDTH        128
#define SCREEN_HEIGHT       64
#define OLED_RESET_PIN      -1    // Shared with Arduino reset pin
#define OLED_I2C_ADDR       0x3C  // Default I2C address for SSD1306

// Sensor Types & Timing
#define DHT_TYPE            DHT22
#define SERIAL_BAUD_RATE    115200  // Host Web Serial communication baud rate
#define TELEMETRY_INTERVAL  1000    // Telemetry & OLED refresh rate (ms) = 1.0 Hz
#define DHT_READ_INTERVAL   2000    // DHT22 polling interval (ms) = 2.0s

// ============================================================================
// 2. CALIBRATED RUNTIME THRESHOLDS & ALARM DEFINITIONS
// ============================================================================
int threshold_mq2_warn    = 380;   // MQ-2 Smoke Warning Threshold
int threshold_mq2_crit    = 580;   // MQ-2 Smoke Critical Alarm Threshold (Smoke Detection)
int threshold_mq135_warn  = 320;   // MQ-135 Air Quality Warning Threshold
int threshold_mq135_crit  = 520;   // MQ-135 Toxic Gas Critical Alarm Threshold (Gas Detection)
float threshold_temp_warn = 35.0f; // Cabin Temperature Warning (°C)
float threshold_temp_crit = 42.0f; // Cabin Temperature Critical Alarm (°C)

// Operational Safety Status Enum
enum SystemStatus {
  STATUS_NORMAL,
  STATUS_WARNING,
  STATUS_CRITICAL,
  STATUS_SENSOR_ERROR
};

// ============================================================================
// 3. GLOBAL DRIVERS & TIMING STATE
// ============================================================================
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET_PIN);
DHT dht(PIN_DHT22, DHT_TYPE);

// Sensor Data Struct
struct SensorReadings {
  int mq2Raw;
  int mq135Raw;
  float temperature;
  float humidity;
  bool dhtValid;
} currentReadings;

// Non-blocking Timers
unsigned long lastTelemetryTime    = 0;
unsigned long lastDhtReadTime      = 0;
unsigned long lastBuzzerToggleTime = 0;
bool buzzerToneState               = false;
bool oledAvailable                 = false;

// Serial Command Parsing Buffer
char serialBuffer[80];
uint8_t serialBufferIdx = 0;

// ============================================================================
// 4. FUNCTION DECLARATIONS
// ============================================================================
void readSensors();
int readSmoothedAnalog(uint8_t pin, uint8_t samples = 4);
SystemStatus evaluateSafetyStatus();
void updateBuzzer(SystemStatus status);
void emitSerialTelemetry(SystemStatus status);
void renderOledDisplay(SystemStatus status);
void showOledBootScreen();
void processIncomingSerial();
void handleCommand(const char* cmd);

// ============================================================================
// 5. SETUP FUNCTION
// ============================================================================
void setup() {
  // 1. Initialize Serial Communication for Web Serial API
  Serial.begin(SERIAL_BAUD_RATE);
  while (!Serial && millis() < 1000);

  // 2. Configure Pin Modes
  pinMode(PIN_MQ2, INPUT);
  pinMode(PIN_MQ135, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // Ensure buzzer is initially silent
  noTone(PIN_BUZZER);

  // 3. Initialize DHT22 Sensor
  dht.begin();
  currentReadings.mq2Raw = 0;
  currentReadings.mq135Raw = 0;
  currentReadings.temperature = 25.0f;
  currentReadings.humidity = 50.0f;
  currentReadings.dhtValid = false;

  // 4. Initialize OLED Display (I2C)
  Wire.begin();
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    oledAvailable = true;
    showOledBootScreen();
  } else {
    oledAvailable = false;
    Serial.println(F("{\"event\":\"notice\",\"msg\":\"OLED not detected at 0x3C\"}"));
  }

  // Boot Announcement
  Serial.println(F("{\"event\":\"boot\",\"device\":\"AutoSense-Uno\",\"fw\":\"1.1.0-buzzer-oled\",\"logic\":\"5V\"}"));
}

// ============================================================================
// 6. MAIN LOOP
// ============================================================================
void loop() {
  // 1. Read All Sensors (Non-blocking)
  readSensors();

  // 2. Evaluate Safety Condition
  SystemStatus currentStatus = evaluateSafetyStatus();

  // 3. Drive Physical Buzzer (Tone on Critical Alert)
  updateBuzzer(currentStatus);

  // 4. Listen for Incoming Runtime Commands from Dashboard
  processIncomingSerial();

  // 5. Periodic 1.0 Hz Telemetry Broadcast & OLED Refresh
  unsigned long now = millis();
  if (now - lastTelemetryTime >= TELEMETRY_INTERVAL) {
    lastTelemetryTime = now;

    // Refresh OLED with Header, Body (Temp & Gas values), and Footer
    if (oledAvailable) {
      renderOledDisplay(currentStatus);
    }

    // Output JSON record to Host
    emitSerialTelemetry(currentStatus);
  }
}

// ============================================================================
// 7. SENSOR ACQUISITION LOGIC
// ============================================================================
void readSensors() {
  // Read Analog MQ sensors with 4-sample anti-noise averaging
  currentReadings.mq2Raw   = readSmoothedAnalog(PIN_MQ2, 4);
  currentReadings.mq135Raw = readSmoothedAnalog(PIN_MQ135, 4);

  // Read DHT22 at non-blocking interval (minimum 2000 ms hardware limit)
  unsigned long now = millis();
  if (now - lastDhtReadTime >= DHT_READ_INTERVAL || lastDhtReadTime == 0) {
    lastDhtReadTime = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (isnan(t) || isnan(h)) {
      currentReadings.dhtValid = false;
    } else {
      currentReadings.temperature = t;
      currentReadings.humidity = h;
      currentReadings.dhtValid = true;
    }
  }
}

int readSmoothedAnalog(uint8_t pin, uint8_t samples) {
  long sum = 0;
  for (uint8_t i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delayMicroseconds(200); // ADC capacitor settle time
  }
  return (int)(sum / samples);
}

// ============================================================================
// 8. SAFETY EVALUATION
// ============================================================================
SystemStatus evaluateSafetyStatus() {
  // 1. Check Critical Thresholds FIRST (Immediate safety: Smoke, Toxic Gas, Cabin Thermal Overheat)
  if (currentReadings.mq2Raw >= threshold_mq2_crit ||
      currentReadings.mq135Raw >= threshold_mq135_crit ||
      (currentReadings.dhtValid && currentReadings.temperature >= threshold_temp_crit)) {
    return STATUS_CRITICAL;
  }

  // 2. Check Warning Thresholds
  if (currentReadings.mq2Raw >= threshold_mq2_warn ||
      currentReadings.mq135Raw >= threshold_mq135_warn ||
      (currentReadings.dhtValid && currentReadings.temperature >= threshold_temp_warn)) {
    return STATUS_WARNING;
  }

  // 3. Check for sensor communication failure
  if (!currentReadings.dhtValid) {
    return STATUS_SENSOR_ERROR;
  }

  return STATUS_NORMAL;
}

// ============================================================================
// 9. BUZZER CONTROL (Single Buzzer on Pin D8)
// ============================================================================
void updateBuzzer(SystemStatus status) {
  if (status == STATUS_CRITICAL) {
    // Pulsing 2.4 kHz audible alarm tone (150ms on / 150ms off)
    if (millis() - lastBuzzerToggleTime >= 150) {
      lastBuzzerToggleTime = millis();
      buzzerToneState = !buzzerToneState;
      if (buzzerToneState) {
        tone(PIN_BUZZER, 2400);
      } else {
        noTone(PIN_BUZZER);
      }
    }
  } else {
    // Safe, Warning, or Sensor Error -> Buzzer stays OFF
    noTone(PIN_BUZZER);
    buzzerToneState = false;
  }
}

// ============================================================================
// 10. SERIAL TELEMETRY EMISSION (JSON)
// ============================================================================
void emitSerialTelemetry(SystemStatus status) {
  const char* statusStr = "NORMAL";
  if (status == STATUS_CRITICAL) statusStr = "CRITICAL";
  else if (status == STATUS_WARNING) statusStr = "WARNING";
  else if (status == STATUS_SENSOR_ERROR) statusStr = "SENSOR_ERROR";

  bool isSmokeCrit = (currentReadings.mq2Raw >= threshold_mq2_crit);
  bool isGasCrit   = (currentReadings.mq135Raw >= threshold_mq135_crit);
  bool isTempCrit  = (currentReadings.dhtValid && currentReadings.temperature >= threshold_temp_crit);

  // Stream formatted JSON directly using F() to conserve ATmega328P 2KB RAM
  Serial.print(F("{\"device\":\"AutoSense-Uno\",\"mq2\":"));
  Serial.print(currentReadings.mq2Raw);
  Serial.print(F(",\"mq135\":"));
  Serial.print(currentReadings.mq135Raw);
  Serial.print(F(",\"temperature\":"));
  Serial.print(currentReadings.temperature, 1);
  Serial.print(F(",\"humidity\":"));
  Serial.print(currentReadings.humidity, 1);
  Serial.print(F(",\"status\":\""));
  Serial.print(statusStr);
  Serial.print(F("\",\"smoke_alert\":"));
  Serial.print(isSmokeCrit ? F("true") : F("false"));
  Serial.print(F(",\"gas_alert\":"));
  Serial.print(isGasCrit ? F("true") : F("false"));
  Serial.print(F(",\"temp_alert\":"));
  Serial.print(isTempCrit ? F("true") : F("false"));
  Serial.print(F(",\"alarm_type\":\""));
  if (isSmokeCrit && isGasCrit) Serial.print(F("SMOKE_AND_GAS"));
  else if (isSmokeCrit) Serial.print(F("SMOKE"));
  else if (isGasCrit) Serial.print(F("GAS"));
  else if (isTempCrit) Serial.print(F("TEMPERATURE"));
  else Serial.print(F("NONE"));
  Serial.println(F("\"}"));
}

// ============================================================================
// 11. OLED DISPLAY RENDERING (With Header, Body & Footer Alarm Indication)
// ============================================================================
void showOledBootScreen() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.drawRect(0, 0, 128, 64, SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(18, 10);
  display.print(F("AUTOSENSE UNO"));

  display.setCursor(12, 24);
  display.print(F("Auto Gas & Smoke"));

  display.setCursor(22, 38);
  display.print(F("Air Monitor"));

  display.setCursor(16, 50);
  display.print(F("OLED & Buzzer Init"));
  display.display();
  delay(1200);
}

void renderOledDisplay(SystemStatus status) {
  display.clearDisplay();

  // Evaluate individual alarm conditions
  bool isSmokeCrit = (currentReadings.mq2Raw >= threshold_mq2_crit);
  bool isSmokeWarn = (currentReadings.mq2Raw >= threshold_mq2_warn);
  bool isGasCrit   = (currentReadings.mq135Raw >= threshold_mq135_crit);
  bool isGasWarn   = (currentReadings.mq135Raw >= threshold_mq135_warn);
  bool isTempCrit  = (currentReadings.dhtValid && currentReadings.temperature >= threshold_temp_crit);
  bool isTempWarn  = (currentReadings.dhtValid && currentReadings.temperature >= threshold_temp_warn);

  // --------------------------------------------------------------------------
  // HEADER BAR (Top Y: 0 to 11)
  // --------------------------------------------------------------------------
  display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK, SSD1306_WHITE); // Inverted black on white
  display.setTextSize(1);

  display.setCursor(3, 2);
  display.print(F("AUTOSENSE"));

  display.setCursor(70, 2);
  if (isSmokeCrit && isGasCrit) {
    display.print(F("[!HAZARD]"));
  } else if (isSmokeCrit) {
    display.print(F("[!SMOKE!]"));
  } else if (isGasCrit) {
    display.print(F("[! GAS !]"));
  } else if (isTempCrit) {
    display.print(F("[!TEMP !]"));
  } else if (status == STATUS_WARNING) {
    display.print(F("[ WARN  ]"));
  } else if (status == STATUS_SENSOR_ERROR) {
    display.print(F("[ ERR!  ]"));
  } else {
    display.print(F("[ SAFE  ]"));
  }

  // --------------------------------------------------------------------------
  // BODY: SENSOR VALUES (Y: 15 to 48) - No ADC mentioned, clean readings
  // --------------------------------------------------------------------------
  display.setTextColor(SSD1306_WHITE);

  // 1. Temperature Readout
  display.setCursor(3, 16);
  display.print(F("Temp : "));
  if (currentReadings.dhtValid) {
    display.print(currentReadings.temperature, 1);
    display.print(F(" C ("));
    display.print((int)currentReadings.humidity);
    display.print(F("%)"));
    if (isTempCrit) display.print(F(" !"));
  } else {
    display.print(F("READ ERR"));
  }

  // 2. MQ-2 Smoke Value (Clean display without ADC label)
  display.setCursor(3, 27);
  display.print(F("Smoke: "));
  display.print(currentReadings.mq2Raw);
  if (isSmokeCrit) {
    display.print(F(" [CRIT!]"));
  } else if (isSmokeWarn) {
    display.print(F(" [WARN]"));
  } else {
    display.print(F(" (OK)"));
  }

  // 3. MQ-135 Gas / Air Quality Value (Clean display without ADC label)
  display.setCursor(3, 38);
  display.print(F("Gas  : "));
  display.print(currentReadings.mq135Raw);
  if (isGasCrit) {
    display.print(F(" [CRIT!]"));
  } else if (isGasWarn) {
    display.print(F(" [WARN]"));
  } else {
    display.print(F(" (OK)"));
  }

  // --------------------------------------------------------------------------
  // FOOTER BAR (Bottom Y: 49 to 63) - Specific Alarm Messages
  // --------------------------------------------------------------------------
  display.drawLine(0, 50, 127, 50, SSD1306_WHITE);

  if (status == STATUS_CRITICAL) {
    // Inverted high-visibility alarm footer on Critical condition
    display.fillRect(0, 52, 128, 12, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    display.setCursor(2, 54);

    if (isSmokeCrit && isGasCrit) {
      display.print(F("SMOKE & GAS DETECTED"));
    } else if (isSmokeCrit) {
      display.print(F("DETECTION OF SMOKE!"));
    } else if (isGasCrit) {
      display.print(F("DETECTION OF GASES!"));
    } else if (isTempCrit) {
      display.print(F("HIGH TEMP DETECTED! "));
    } else {
      display.print(F("CRITICAL ALARM ON!  "));
    }
  } else if (status == STATUS_WARNING) {
    // Warning notice footer
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(2, 54);
    if (isSmokeWarn) {
      display.print(F("WARN: SMOKE DETECTED"));
    } else if (isGasWarn) {
      display.print(F("WARN: GAS DETECTED  "));
    } else if (isTempWarn) {
      display.print(F("WARN: ELEVATED TEMP "));
    } else {
      display.print(F("STATUS: WARN LEVEL  "));
    }
  } else if (status == STATUS_SENSOR_ERROR) {
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(2, 54);
    display.print(F("SENSOR COMM FAULT   "));
  } else {
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(2, 54);
    display.print(F("AIR QUALITY: NORMAL "));
  }

  display.display();
}

// ============================================================================
// 12. SERIAL COMMAND LISTENER & RUNTIME THRESHOLD TUNING
// ============================================================================
void processIncomingSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialBufferIdx > 0) {
        serialBuffer[serialBufferIdx] = '\0';
        handleCommand(serialBuffer);
        serialBufferIdx = 0;
      }
    } else if (serialBufferIdx < sizeof(serialBuffer) - 1) {
      serialBuffer[serialBufferIdx++] = c;
    }
  }
}

void handleCommand(const char* cmd) {
  if (strstr(cmd, "\"cmd\":\"ping\"")) {
    Serial.println(F("{\"event\":\"config_ack\",\"status\":\"PONG\"}"));
    return;
  }

  if (strstr(cmd, "\"cmd\":\"set_thresholds\"")) {
    int m2w = 0, m2c = 0, m135w = 0, m135c = 0;
    float tw = 0.0f, tc = 0.0f;

    const char* pM2w   = strstr(cmd, "\"mq2_w\":");
    const char* pM2c   = strstr(cmd, "\"mq2_c\":");
    const char* pM135w = strstr(cmd, "\"mq135_w\":");
    const char* pM135c = strstr(cmd, "\"mq135_c\":");
    const char* pTw    = strstr(cmd, "\"temp_w\":");
    const char* pTc    = strstr(cmd, "\"temp_c\":");

    if (pM2w && pM2c && pM135w && pM135c && pTw && pTc) {
      m2w   = atoi(pM2w + 8);
      m2c   = atoi(pM2c + 8);
      m135w = atoi(pM135w + 10);
      m135c = atoi(pM135c + 10);
      tw    = atof(pTw + 9);
      tc    = atof(pTc + 9);

      if (m2w > 0 && m2c > m2w && m2c <= 1023 &&
          m135w > 0 && m135c > m135w && m135c <= 1023 &&
          tw >= 10.0f && tc > tw && tc <= 85.0f) {

        threshold_mq2_warn   = m2w;
        threshold_mq2_crit   = m2c;
        threshold_mq135_warn = m135w;
        threshold_mq135_crit = m135c;
        threshold_temp_warn  = tw;
        threshold_temp_crit  = tc;

        Serial.println(F("{\"event\":\"config_ack\",\"status\":\"OK\"}"));
        return;
      }
    }

    Serial.println(F("{\"event\":\"config_ack\",\"status\":\"INVALID_PARAMS\"}"));
    return;
  }

  Serial.println(F("{\"event\":\"config_ack\",\"status\":\"UNKNOWN_CMD\"}"));
}
