# AutoSense — Smart Automotive Gas, Smoke & Air-Quality Monitoring System

AutoSense is a comprehensive telemetry dashboard and embedded sensor system designed for prototype automotive cabin air-quality, smoke, and combustible gas monitoring.

The system connects an **Arduino Uno** via physical USB to a modern web application using the browser **Web Serial API**, streaming real sensor readings and updating interactive cards, rolling telemetry graphs, and incident alert logs in real time.

---

## 1. Project Overview & Features

* **Real USB Web Serial Connection:** Directly connects the browser to the Arduino Uno's virtual COM port at `115200 baud` without third-party serial bridges or background Python/Node.js servers.
* **Autonomous Edge Protection:** The Arduino Uno monitors thresholds directly in firmware and drives local hardware alert indicators (Green/Yellow/Red LEDs and an audible buzzer alarm). Critical alarms function even if the laptop or browser is closed or disconnected.
* **Telemetry Dashboard (8 Industrial Cards):**
  1. *Overall System Status* (SAFE, WARNING, CRITICAL, SENSOR ERROR, OFFLINE) with Arduino hardware indicator mirrors.
  2. *Arduino Connection Telemetry* (Device ID, COM port, baud rate, packet counts, watchdog status).
  3. *MQ-2 Combustible Gas & Smoke Response* (Raw 10-bit ADC 0–1023 and calculated 0.00–5.00V analog voltage).
  4. *MQ-135 General Air-Quality Response* (Raw 10-bit ADC 0–1023 and calculated 0.00–5.00V analog voltage).
  5. *Cabin Temperature* (DHT22 digital readout in °C and °F with min/max tracking).
  6. *Cabin Relative Humidity* (DHT22 readout in % RH with comfort index).
  7. *Active Alerts* (Real-time active alerts with acknowledgement controls).
  8. *Active Sensors & Hardware Health* (Bus status and health for all 4 channels).
* **Live Rolling Charts (Chart.js):** Real-time history for MQ-2, MQ-135, Temperature, and Humidity with configurable rolling window (20–150 samples) and history clearing.
* **RFC 4180 Compliant CSV Export:** One-click export of real captured telemetry with ISO-8601 browser timestamps for scientific analysis.
* **Runtime Threshold Tuning:** Adjust and sync demonstration alarm thresholds dynamically to the Arduino Uno over USB Serial without re-uploading firmware.
* **Offline Demo Simulator Mode:** Test and explore all dashboard features, graphs, and alert animations even before physical hardware is wired.

---

## 2. Hardware Bill of Materials

| Item | Component | Specification | Function |
| :---: | :--- | :--- | :--- |
| 1 | **Arduino Uno Rev3** | ATmega328P @ 16 MHz, 5V logic | Main microcontroller node |
| 2 | **MQ-2 Gas/Smoke Sensor** | Metal oxide gas sensor module | Combustible gas & smoke response |
| 3 | **MQ-135 Air Quality Sensor**| Metal oxide gas sensor module | General air-quality / VOC response |
| 4 | **DHT22 (AM2302)** | Digital capacitive sensor | Precision temperature & humidity |
| 5 | **SSD1306 OLED Display** | 128x64 pixels, I2C interface (0x3C)| In-vehicle local readout |
| 6 | **Green LED** | 5mm diffused LED | Safe baseline visual indicator |
| 7 | **Yellow LED** | 5mm diffused LED | Warning condition visual indicator |
| 8 | **Red LED** | 5mm diffused LED | Critical alert visual indicator |
| 9 | **Buzzer** | 5V active or passive piezo buzzer | Audible alarm during critical alerts |
| 10 | **Resistors** | 3× 220Ω (LEDs), 1× 10kΩ (DHT22 pullup)| Circuit protection & signal pullup |
| 11 | **USB Cable** | USB 2.0 Type-A to Type-B | Connects Arduino Uno to computer |

---

## 3. Hardware Wiring Table

| Component | Pin Label | Arduino Uno Pin | Voltage / Type | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **MQ-2 Sensor** | VCC | **5V** | 5.0 V DC | Internal heater draws ~160 mA |
| | GND | **GND** | Ground | Common system ground |
| | AOUT | **A0** | 0.0 V – 5.0 V Analog | 10-bit analog channel |
| **MQ-135 Sensor**| VCC | **5V** | 5.0 V DC | Internal heater draws ~150 mA |
| | GND | **GND** | Ground | Common system ground |
| | AOUT | **A1** | 0.0 V – 5.0 V Analog | 10-bit analog channel |
| **DHT22 Sensor** | Pin 1 (VCC)| **5V** | 5.0 V DC | Power supply |
| | Pin 2 (DATA)| **D2** | 5.0 V Digital I/O | Pullup 10kΩ resistor to 5V |
| | Pin 4 (GND) | **GND** | Ground | Common ground |
| **SSD1306 OLED** | VCC | **5V** | 5.0 V DC | Power supply |
| | GND | **GND** | Ground | Common ground |
| | SCL | **A5** (SCL) | 5.0 V I2C Clock | Dedicated Uno I2C clock |
| | SDA | **A4** (SDA) | 5.0 V I2C Data | Dedicated Uno I2C data |
| **Green LED** | Anode (+) | **D5** | 5.0 V Digital Out | In series with 220Ω resistor |
| | Cathode (-)| **GND** | Ground | Ground rail |
| **Yellow LED** | Anode (+) | **D6** | 5.0 V Digital Out | In series with 220Ω resistor |
| | Cathode (-)| **GND** | Ground | Ground rail |
| **Red LED** | Anode (+) | **D7** | 5.0 V Digital Out | In series with 220Ω resistor |
| | Cathode (-)| **GND** | Ground | Ground rail |
| **Piezo Buzzer** | Positive (+)| **D8** | 5.0 V Digital / PWM | Driven with 2.4 kHz alarm tone |
| | Negative (-)| **GND** | Ground | Ground rail |

---

## 4. Software Setup & Firmware Upload

### Step 1: Install Arduino IDE & Libraries
1. Download and install [Arduino IDE (v2.x or v1.8.x)](https://www.arduino.cc/en/software).
2. Open the **Library Manager** (`Sketch` &rarr; `Include Library` &rarr; `Manage Libraries...`).
3. Search and install the following libraries:
   * **DHT sensor library** by *Adafruit*
   * **Adafruit Unified Sensor** by *Adafruit*
   * **Adafruit SSD1306** by *Adafruit*
   * **Adafruit GFX Library** by *Adafruit*

### Step 2: Flash the Arduino Uno
1. Open [`Arduino/AutoSense.ino`](file:///c:/Users/Welcome%20Dhanya/Downloads/AUTO%20AIR/Arduino/AutoSense.ino).
2. Connect your Arduino Uno to your PC via USB.
3. Select **Board:** `Arduino Uno` and choose your serial **Port:** (e.g. `COM3` on Windows).
4. Click **Upload**.
5. Once completed, the SSD1306 OLED displays the AutoSense boot screen, the Green LED illuminates, and serial output begins broadcasting.

---

## 5. Running the Web Dashboard

### Browser Requirements
* **Supported Browsers:** Google Chrome (v89+), Microsoft Edge (v89+), or Opera (v75+).
* **Secure Context:** The Web Serial API strictly requires a secure context: `localhost`, `127.0.0.1`, or an `https://` origin.

### Launching the Website
You can serve the project using any lightweight static web server:

**Option A: Using Python (Recommended)**
```bash
# In the project root directory:
python -m http.server 8000
```
Then open your browser to `http://localhost:8000`.

**Option B: Using Node.js npx**
```bash
npx serve -l 8000 .
```
Then open your browser to `http://localhost:8000`.

**Option C: Using VS Code Live Server**
Right-click [`index.html`](file:///c:/Users/Welcome%20Dhanya/Downloads/AUTO%20AIR/index.html) and select **"Open with Live Server"**.

---

## 6. How to Connect the Arduino to the Dashboard

1. **Close the Arduino IDE Serial Monitor.** Operating systems do not allow two programs to access the same COM port simultaneously.
2. In the AutoSense dashboard, click the blue **"Connect Device"** button in the header.
3. A browser security prompt will appear listing connected USB devices. Select your **Arduino Uno** (e.g., `USB Serial Device (COM3)`) and click **Connect**.
4. The status indicator will transition to **"DEVICE CONNECTED"** as soon as the first valid JSON packet arrives.
5. Watch the dashboard cards and charts update live at 1.0 Hz!

---

## 7. Serial Protocol & Architecture

The Arduino broadcasts one newline-delimited (`\n`) JSON packet every second:
```json
{"device":"AutoSense-Uno","mq2":320,"mq135":285,"temperature":32.4,"humidity":58.0,"status":"NORMAL"}
```

For full details on packet schemas, command uplink, and watchdog timeouts, refer to [`docs/serial-protocol.md`](file:///c:/Users/Welcome%20Dhanya/Downloads/AUTO%20AIR/docs/serial-protocol.md).

---

## 8. Safety & Accuracy Limitations

* **Student Prototype Notice:** This system is an educational prototype and is **not a certified automotive safety device**.
* **Uncalibrated Sensor Output:** MQ-2 and MQ-135 are broad-response resistive sensors. Readings are displayed as raw ADC numbers (0–1023) and analog voltages (0.00–5.00V). Uncalibrated readings do not represent exact parts-per-million (ppm) gas concentrations.
* **Carbon Monoxide (CO) Hazard:** MQ-2 and MQ-135 cannot reliably identify low-level toxic carbon monoxide. For vehicle cabin CO protection, install a dedicated certified automotive carbon monoxide detector.
* **Environmental Limitations:** Do not install this hobby prototype directly in an automotive engine bay where temperatures exceed 85°C to 125°C.

---

## 9. Future Migration to ESP32

When migrating to an ESP32 microcontroller in the future:
1. **3.3V Logic Level Translation:** The ESP32 uses 3.3V logic. MQ sensors powered by 5V must use a resistor divider or level shifter on their analog outputs to stay within the ESP32's 3.3V ADC limit.
2. **Wireless Telemetry:** The firmware architecture is designed to support WebSockets, Bluetooth Low Energy (BLE), or MQTT over Wi-Fi without altering the dashboard card interfaces.
