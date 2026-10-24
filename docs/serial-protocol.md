# AutoSense — Serial Communication Protocol Specification

## 1. Physical Layer & Framing Specifications

* **Physical Interface:** USB Virtual COM Port (CDC-ACM)
* **Baud Rate:** `115200 bps` (Default, configurable in `config.h`)
* **Byte Format:** 8 Data Bits, No Parity, 1 Stop Bit (8-N-1)
* **Flow Control:** None (Software line-based flow)
* **Record Delimiter:** Newline terminated (`\n` or `\r\n`)
* **Payload Encoding:** UTF-8 JSON Object

---

## 2. Downlink Telemetry (Arduino Uno &rarr; Host Dashboard)

The Arduino firmware broadcasts one valid, newline-terminated JSON object every **1000 milliseconds** (`1.0 Hz`).

### Example Telemetry Packet:
```json
{"device":"AutoSense-Uno","mq2":320,"mq135":285,"temperature":32.4,"humidity":58.0,"status":"NORMAL"}
```

### Telemetry Field Schema:

| Field | Type | Unit / Range | Description |
| :--- | :--- | :--- | :--- |
| `device` | String | `"AutoSense-Uno"` | Identifies the physical microcontroller node. |
| `mq2` | Integer | `0` to `1023` | Raw 10-bit ADC output from MQ-2 combustible gas/smoke response channel. |
| `mq135` | Integer | `0` to `1023` | Raw 10-bit ADC output from MQ-135 general air-quality response channel. |
| `temperature`| Float | `-40.0` to `85.0` °C | Monitored cabin temperature acquired from the calibrated DHT22 digital sensor. |
| `humidity` | Float | `0.0` to `100.0` % RH | Relative humidity acquired from the DHT22 digital sensor. |
| `status` | String | Enum | Operational health state: `"NORMAL"`, `"WARNING"`, `"CRITICAL"`, or `"SENSOR_ERROR"`. |

### Boot Notification Packet:
When first powered or reset, the firmware transmits a single boot announcement:
```json
{"event":"boot","device":"AutoSense-Uno","fw":"1.0.0","logic":"5V"}
```

---

## 3. Uplink Commands (Host Dashboard &rarr; Arduino Uno)

The host browser sends runtime commands to update demonstration thresholds or perform status pings.

### A. Threshold Configuration Command (`set_thresholds`)
Allows the dashboard operator to dynamically tune alarm limits in the Arduino's RAM without modifying or re-uploading firmware.

**Command Payload:**
```json
{"cmd":"set_thresholds","mq2_w":400,"mq2_c":650,"mq135_w":350,"mq135_c":600,"temp_w":35.0,"temp_c":45.0}
```

**Parameters:**
* `mq2_w`: MQ-2 Warning ADC threshold (Integer: 50 – 1000)
* `mq2_c`: MQ-2 Critical ADC threshold (Integer: `mq2_w` < `mq2_c` <= 1023)
* `mq135_w`: MQ-135 Warning ADC threshold (Integer: 50 – 1000)
* `mq135_c`: MQ-135 Critical ADC threshold (Integer: `mq135_w` < `mq135_c` <= 1023)
* `temp_w`: Cabin Temperature Warning limit (Float °C: 10.0 – 70.0)
* `temp_c`: Cabin Temperature Critical limit (Float °C: `temp_w` < `temp_c` <= 85.0)

**Arduino Validation & Acknowledgement:**
If all limits pass validation, the Arduino replies:
```json
{"event":"config_ack","status":"OK"}
```
If parameter ranges or sanity checks fail:
```json
{"event":"config_ack","status":"INVALID_PARAMS"}
```

### B. Heartbeat Ping Command (`ping`)
```json
{"cmd":"ping"}
```
**Arduino Response:**
```json
{"event":"config_ack","status":"PONG"}
```

---

## 4. Error Handling & Watchdog Protocol

1. **Fragmented Stream Reconstruction:** Web Serial receives chunks of arbitrary byte lengths. The browser client buffers incoming chunks in memory and slices strictly by line feeds (`\n`).
2. **Malformed Packet Discard:** Any JSON payload failing schema validation is discarded immediately and recorded in the dashboard error metric without crashing the UI.
3. **Hardware Watchdog:** If no valid packet arrives from the Arduino for more than **4000 milliseconds**, the dashboard automatically sets the device state to `DEVICE OFFLINE / TIMEOUT` and alerts the user.
