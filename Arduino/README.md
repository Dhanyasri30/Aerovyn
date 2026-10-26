# AutoSense — Arduino Uno Single-File Firmware Guide

This directory contains the complete, self-contained single-file Arduino sketch: [`AutoSense.ino`](file:///c:/Users/Welcome%20Dhanya/Downloads/AUTO%20AIR/Arduino/AutoSense.ino).

Everything is bundled in this one file:
* Pin assignments and constants
* Default thresholds and configuration
* MQ-2 and MQ-135 analog noise-filtered acquisition
* DHT22 digital temperature and humidity reading
* SSD1306 128x64 OLED display boot screen and live 4-channel telemetry rendering
* Autonomous physical indicator logic (Green, Yellow, Red LEDs and pulsing Buzzer alarm)
* 1.0 Hz newline-delimited JSON telemetry stream (`115200 baud`)
* Serial command listener for runtime threshold tuning

---

## 1. Hardware Pin Configuration

| Module | Pin | Arduino Uno Pin | Voltage / Type | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **MQ-2 Gas / Smoke** | AOUT | **A0** | 5.0 V Analog (0–5V) | Hydrocarbon & smoke response |
| **MQ-135 Air Quality** | AOUT | **A1** | 5.0 V Analog (0–5V) | General air quality response |
| **DHT22 Temp & Humidity**| DATA | **D2** | 5.0 V Digital I/O | Requires 10kΩ pullup to 5V |
| **SSD1306 OLED (128x64)**| SDA | **A4** (SDA) | 5.0 V I2C Data | Dedicated Uno I2C data |
| | SCL | **A5** (SCL) | 5.0 V I2C Clock | Dedicated Uno I2C clock |
| **Buzzer** | Positive (+)| **D8** | 5.0 V Digital / Tone | Universal active/passive support; sounds warning chirp & urgent critical alarm |

> [!TIP]
> **Active vs. Passive Buzzer Support:**
> The sketch defaults to `#define BUZZER_IS_ACTIVE 1` (compatible with 95% of 2-pin and 3-pin Arduino starter kit active buzzers). If using a passive piezo buzzer transducer, set `#define BUZZER_IS_ACTIVE 0` at the top of [`AutoSense.ino`](file:///c:/Users/Welcome%20Dhanya/Downloads/AUTO%20AIR/Arduino/AutoSense.ino). A 150ms confirmation beep sounds at startup to confirm wiring.

---

## 2. Required Libraries

Install the following official libraries using the **Arduino IDE Library Manager** (`Sketch` -> `Include Library` -> `Manage Libraries...`):

1. **DHT sensor library** by *Adafruit*
2. **Adafruit Unified Sensor** by *Adafruit*
3. **Adafruit SSD1306** by *Adafruit*
4. **Adafruit GFX Library** by *Adafruit*

---

## 3. How to Open and Upload

1. Open **Arduino IDE**.
2. Select **File &rarr; Open...** and choose [`Arduino/AutoSense.ino`](file:///c:/Users/Welcome%20Dhanya/Downloads/AUTO%20AIR/Arduino/AutoSense.ino).
3. Connect your Arduino Uno to your PC via USB.
4. Select **Tools &rarr; Board &rarr; Arduino Uno**.
5. Select **Tools &rarr; Port &rarr; (Your Arduino COM Port)**.
6. Click **Upload**.
7. Close the Arduino IDE Serial Monitor so the browser can connect to the port!
