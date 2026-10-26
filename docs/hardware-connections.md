# AutoSense — Hardware Connections & Electrical Schematic Guide

This document describes the complete wiring specifications, voltage constraints, power consumption budgets, and physical installation considerations for the AutoSense prototype.

---

## 1. Pin Assignment & Connection Table

| Hardware Module | Module Pin | Arduino Uno Pin | Recommended Wire Color | Electrical Specification | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MQ-2 Sensor** | VCC | 5V Rail | Red | 5.0 V DC (Heater) | Internal heater draws ~160 mA |
| | GND | GND Rail | Black | Ground | Common system ground |
| | AOUT | **A0** | Yellow | 0.0 V – 5.0 V Analog | 10-bit ADC channel |
| **MQ-135 Sensor**| VCC | 5V Rail | Red | 5.0 V DC (Heater) | Internal heater draws ~150 mA |
| | GND | GND Rail | Black | Ground | Common system ground |
| | AOUT | **A1** | Blue | 0.0 V – 5.0 V Analog | 10-bit ADC channel |
| **DHT22** | Pin 1 (VCC)| 5V Rail | Red | 3.3 V – 5.5 V DC | Power supply |
| | Pin 2 (DATA)| **D2** | Green | 5.0 V Digital I/O | Requires 4.7kΩ–10kΩ pullup to 5V |
| | Pin 3 (NC) | Not connected| - | - | Unused pin |
| | Pin 4 (GND) | GND Rail | Black | Ground | Common system ground |
| **SSD1306 OLED**| VCC | 5V or 3.3V | Red | 3.3 V – 5.0 V DC | Check module voltage regulator |
| | GND | GND Rail | Black | Ground | Common system ground |
| | SCL | **A5** (SCL) | Orange | 5V I2C Clock | Dedicated Uno hardware I2C |
| | SDA | **A4** (SDA) | White | 5V I2C Data | Dedicated Uno hardware I2C |
| **Piezo Buzzer** | Positive (+)| **D8** | Purple | 5.0 V Digital / Tone | 2.4 kHz pulsing acoustic alarm |
| | Negative (-)| GND Rail | Black | Ground | Common ground |

### 1.1 Buzzer Module Wiring & Type Detection (Active vs. Passive)

There are two primary types of buzzers used in Arduino projects. Understanding which one you have ensures the alarm sounds properly:

1. **Active Buzzer (Most Common - Default in `AutoSense.ino`):**
   - **How to identify:** Usually has a white or yellow removable sticker on top marked *"REMOVE SEAL AFTER WASHING"*, a black epoxy resin-sealed bottom (green circuit board not visible), and a `+` mark on top.
   - **How it works:** Contains an internal oscillator. When fed a constant **5V DC voltage (`digitalWrite(D8, HIGH)`)**, it generates a loud, high-pitched tone (approx. 2.3 kHz).
   - **Common Pitfall:** Calling `tone(8, 2400)` sends an AC square wave that conflicts with the internal oscillator, causing the active buzzer to remain silent or only emit faint clicks! AutoSense firmware includes `BUZZER_IS_ACTIVE 1` to fix this issue automatically.
   - **3-Pin Active Buzzer Modules:**
     - `VCC` or `+` &rarr; 5V Rail
     - `GND` or `-` &rarr; GND Rail
     - `I/O` or `S` &rarr; **Arduino Pin D8**
   - **2-Pin Active Buzzers:**
     - Longer leg (`+`) &rarr; **Arduino Pin D8**
     - Shorter leg (`-`) &rarr; GND Rail

2. **Passive Piezo Buzzer:**
   - **How to identify:** Green circuit board visible on the underside, no internal oscillator circuit.
   - **How it works:** Requires an alternating AC frequency (`tone(8, freq)`).
   - **Configuration:** If using a passive buzzer, set `#define BUZZER_IS_ACTIVE 0` at the top of [`AutoSense.ino`](file:///c:/Users/Welcome%20Dhanya/Downloads/AUTO%20AIR/Arduino/AutoSense.ino).

3. **Firmware Audio Indicators:**
   - **Power-On Self-Test (POST):** Emits a 150 ms confirmation chirp immediately upon boot/reset to confirm wiring.
   - **Warning State:** Intermittent caution chirp (80 ms pulse every 1.2 seconds) when smoke, gas, or temperature rises into warning range.
   - **Critical State:** Urgent continuous rapid pulsing alarm (150 ms ON / 150 ms OFF).

---

## 2. Power Consumption Budget & Power Rail Design

The AutoSense prototype contains two gas sensors equipped with internal resistive heating coils:
- **MQ-2 Internal Heater:** ~160 mA @ 5V (approx. 0.8 W)
- **MQ-135 Internal Heater:** ~150 mA @ 5V (approx. 0.75 W)
- **Arduino Uno ATmega328P:** ~45 mA
- **SSD1306 OLED (All Pixels Lit):** ~25 mA
- **DHT22 Sampling:** ~1.5 mA
- **LEDs & Buzzer (Critical State Active):** ~40 mA

### Power Supply Recommendation:
- **Total Peak Consumption:** ~420 mA – 480 mA.
- Standard PC USB 2.0 ports are limited to 500 mA. Running the board from an unpowered USB hub or long unshielded USB extension cable may result in brownout resets on the Arduino Uno when the buzzer and LEDs activate.
- For reliable operation, power the Arduino Uno via a regulated **5V 2A external DC power adapter** or a dedicated powered USB 3.0 port.

---

## 3. Voltage Constraints & Logic Compatibility

1. **5.0V Native Logic:** The Arduino Uno ATmega328P operates with 5V logic thresholds:
   - Input High ($V_{IH}$): Minimum 3.0 V
   - Input Low ($V_{IL}$): Maximum 1.5 V
2. **Analog Limits:** The analog pins A0 and A1 measure voltages relative to the 5.0V internal reference ($V_{REF} = 5.0\text{ V}$). The input voltage must never exceed 5.0 V.
3. **I2C Bus Compatibility:** Most standard SSD1306 breakout boards feature on-board pullup resistors and a 3.3V low-dropout (LDO) regulator with 5V-tolerant level shifting. Verify your module markings before connecting.

---

## 4. Vehicle Installation & Environmental Considerations

> [!CAUTION]
> **Do not install this prototype directly in an automotive engine bay:**
> - Consumer hobbyist components (solder joints, plastic breadboards, jumper wires) will rapidly fail when exposed to engine bay ambient temperatures exceeding 85°C to 125°C.
> - Automotive electrical environments feature high-voltage transients (load dump events up to 40V+), severe vibration, and corrosive fumes.
> - This prototype is intended strictly for bench testing or controlled cabin passenger compartment evaluation.
