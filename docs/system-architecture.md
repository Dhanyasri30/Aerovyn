# AutoSense — System Architecture & Data Flow

## 1. High-Level Architecture Overview

AutoSense is an automotive telemetry and cabin safety demonstration platform. It integrates a dedicated edge microcontroller (Arduino Uno) with a browser-based real-time telemetry dashboard using the modern **Web Serial API**.

```mermaid
graph TD
    subgraph Hardware Layer (Vehicle Zone)
        MQ2[MQ-2 Smoke & Combustible Gas Sensor A0] -->|Analog 0-5V| Uno[Arduino Uno ATmega328P]
        MQ135[MQ-135 General Air Quality A1] -->|Analog 0-5V| Uno
        DHT[DHT22 Temp & Humidity D2] -->|1-Wire Digital| Uno
        Uno -->|I2C SDA/SCL| OLED[SSD1306 128x64 OLED Display]
        Uno -->|Autonomous Digital Out| LEDS[LEDs Green/Yellow/Red D5/D6/D7]
        Uno -->|PWM / Tone| BUZZ[Local Critical Buzzer D8]
    end

    subgraph Interface Layer
        Uno <===>|USB Serial 115200 Baud CDC-ACM| WebSerial[Browser Web Serial API]
    end

    subgraph Presentation & Analytics Layer (Browser)
        WebSerial --> Parser[Stream Chunk Decoder & JSON Validator]
        Parser --> Watchdog[Watchdog & Health Monitor]
        Parser --> AlertEngine[Alert & Incident Manager]
        Parser --> CardRenderer[Dashboard 8-Card Telemetry Grid]
        Parser --> ChartEngine[Chart.js Rolling History Graphs]
        CardRenderer --> CSV[RFC 4180 CSV Data Exporter]
        AlertEngine --> Audio[Web Audio Synthesized Chime]
        SettingsUI[Settings Panel] -->|Host TX Command| WebSerial
    end
```

---

## 2. Component Subsystems

### A. Edge Acquisition & Autonomous Fail-Safe (Arduino Uno)
- **ATmega328P Microcontroller:** Operates at 16 MHz with 5V logic.
- **Noise Rejection Filter:** 4-sample analog oversampling with capacitor settling stabilization on pins A0 and A1.
- **Deterministic 1.0 Hz Loop:** Operates non-blocking using `millis()` timing to stream JSON records without serial packet starvation.
- **Local Alarm Autonomy:** Physical alarms (Red LED on D7, pulsing 2.4 kHz audio on D8) execute directly in firmware. Local safety alarms do not depend on the browser or USB connection.

### B. High-Speed Serialization Layer
- **Transport:** USB Virtual COM Port (CDC-ACM) at 115,200 baud.
- **Framing:** Strict newline-delimited (`\n`) JSON packets.
- **Memory Footprint:** Uses zero-allocation character scanning to prevent 2KB SRAM fragmentation on the ATmega328P.

### C. Client Telemetry Dashboard
- **Web Serial API Integration:** Provides direct native USB access from modern Chromium-based browsers without third-party daemon drivers, Node.js bridges, or WebSocket servers.
- **Watchdog Protection:** Evaluates arrival times of valid JSON frames. Transitions interface cleanly to "DEVICE OFFLINE / TIMEOUT" if physical disconnects or cable faults occur.
- **Live Visual Analytics:** Chart.js canvas rendering with fixed rolling windows to ensure stable rendering performance over long test runs.

---

## 3. Data Integrity & Validation Pipeline

1. **Physical Sample:** Arduino Uno samples sensors and formats JSON.
2. **Stream Assembly:** JavaScript `TextDecoderStream` reassembles fragmented incoming serial bytes into newline-separated strings.
3. **Schema Verification:** Each JSON frame is checked for:
   - Presence of `device`, `mq2`, `mq135`, `temperature`, `humidity`, and `status`.
   - Numeric range boundaries: `0 <= mq2, mq135 <= 1023`, `-40 <= temp <= 125`, `0 <= hum <= 100`.
4. **Client Timestamping:** Browser attaches an authoritative ISO-8601 millisecond timestamp upon frame validation.
5. **State Dispatch:** Validated frames are dispatched simultaneously to the Dashboard cards, Alert Manager, and Rolling Chart datasets.
