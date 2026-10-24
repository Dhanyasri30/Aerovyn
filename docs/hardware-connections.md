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
