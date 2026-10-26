/**
 * AutoSense — Smart Automotive Gas, Smoke & Air-Quality Monitoring System
 * dashboard.js — Telemetry Card Renderer & UI State Controller
 *
 * Updates all 8 dashboard cards:
 * Card A: Overall System Status & Arduino HW LED/Buzzer Mirror
 * Card B: Arduino Connection & Telemetry Metrics
 * Card C: MQ-2 Combustible Gas & Smoke (ADC & Voltage)
 * Card D: MQ-135 General Air Quality (ADC & Voltage)
 * Card E: Cabin Temperature (DHT22 °C and °F)
 * Card F: Cabin Relative Humidity (DHT22 % RH)
 * Card G: Active Alerts Summary
 * Card H: Active Sensors & Hardware Health
 */

class DashboardController {
  constructor(alertManager) {
    this.alertManager = alertManager;

    // Min / Max Trackers
    this.tempMin = Infinity;
    this.tempMax = -Infinity;
    this.humMin = Infinity;
    this.humMax = -Infinity;

    // Simulation Timer
    this.simTimer = null;
    this.isSimulating = false;
    this.simSampleIndex = 0;

    // Cache Core DOM Elements
    this.dom = {
      // Header & Global
      connBadge: document.getElementById('connectionBadge'),
      connText: document.getElementById('connectionText'),
      demoModeBadge: document.getElementById('demoModeBadge'),

      // Card A: Overall System Status
      systemStatusPill: document.getElementById('systemStatusPill'),
      systemStatusBadgeLg: document.getElementById('systemStatusBadgeLg'),
      systemStatusText: document.getElementById('systemStatusText'),
      systemStatusDesc: document.getElementById('systemStatusDesc'),
      lastHeartbeatTime: document.getElementById('lastHeartbeatTime'),
      hwOledStatus: document.getElementById('hwOledStatus'),
      hwBuzzer: document.getElementById('hwBuzzer'),
      hwBuzzerLabel: document.getElementById('hwBuzzerLabel'),

      // Card B: Arduino Connection
      serialStatePill: document.getElementById('serialStatePill'),
      deviceModelText: document.getElementById('deviceModelText'),
      serialBaudPortText: document.getElementById('serialBaudPortText'),
      packetCountText: document.getElementById('packetCountText'),
      packetLatencyText: document.getElementById('packetLatencyText'),

      // Card C: MQ-2
      mq2Val: document.getElementById('mq2Val') || document.getElementById('mq2AdcVal'),
      mq2VoltVal: document.getElementById('mq2VoltVal'),
      mq2StatusPill: document.getElementById('mq2StatusPill'),
      mq2ProgressBar: document.getElementById('mq2ProgressBar'),
      mq2ThresholdNote: document.getElementById('mq2ThresholdNote'),

      // Card D: MQ-135
      mq135Val: document.getElementById('mq135Val') || document.getElementById('mq135AdcVal'),
      mq135VoltVal: document.getElementById('mq135VoltVal'),
      mq135StatusPill: document.getElementById('mq135StatusPill'),
      mq135ProgressBar: document.getElementById('mq135ProgressBar'),
      mq135ThresholdNote: document.getElementById('mq135ThresholdNote'),

      // Card E: Temperature
      tempVal: document.getElementById('tempVal'),
      tempFahrVal: document.getElementById('tempFahrVal'),
      tempStatusPill: document.getElementById('tempStatusPill'),
      tempProgressBar: document.getElementById('tempProgressBar'),
      tempMinMax: document.getElementById('tempMinMax'),

      // Card F: Humidity
      humVal: document.getElementById('humVal'),
      humComfortVal: document.getElementById('humComfortVal'),
      humStatusPill: document.getElementById('humStatusPill'),
      humProgressBar: document.getElementById('humProgressBar'),
      humMinMax: document.getElementById('humMinMax'),

      // Card H: Active Sensors
      sensorHealthPill: document.getElementById('sensorHealthPill'),
      hwSensorMq2: document.getElementById('hwSensorMq2'),
      hwSensorMq135: document.getElementById('hwSensorMq135'),
      hwSensorDht: document.getElementById('hwSensorDht'),
      hwSensorOled: document.getElementById('hwSensorOled'),
      hwSensorBuzzer: document.getElementById('hwSensorBuzzer'),

      // Live OLED Display Hardware Mirror
      oledHeaderTitle: document.getElementById('oledHeaderTitle'),
      oledHeaderStatus: document.getElementById('oledHeaderStatus'),
      oledLineTemp: document.getElementById('oledLineTemp'),
      oledLineSmoke: document.getElementById('oledLineSmoke'),
      oledLineGas: document.getElementById('oledLineGas'),
      oledFooter: document.getElementById('oledFooter'),
      oledFooterText: document.getElementById('oledFooterText')
    };
  }

  /**
   * Primary entry point for updating dashboard with a valid telemetry packet
   */
  updateTelemetry(packet, isDemo = false, metrics = {}) {
    if (!packet) return;

    const ts = packet.timestamp instanceof Date ? packet.timestamp : new Date();
    const timeStr = ts.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Update Threshold Notes
    if (this.alertManager) {
      const th = this.alertManager.thresholds;
      if (this.dom.mq2ThresholdNote) {
        this.dom.mq2ThresholdNote.textContent = `Warn: ${th.mq2Warn} | Crit: ${th.mq2Crit}`;
      }
      if (this.dom.mq135ThresholdNote) {
        this.dom.mq135ThresholdNote.textContent = `Warn: ${th.mq135Warn} | Crit: ${th.mq135Crit}`;
      }
    }

    // 1. Calculate MQ voltages (5V reference on Arduino Uno)
    const mq2Voltage = (packet.mq2 / 1023.0) * 5.0;
    const mq135Voltage = (packet.mq135 / 1023.0) * 5.0;

    // 2. Evaluate status levels for individual sensors
    const th = this.alertManager ? this.alertManager.thresholds : { mq2Warn: 400, mq2Crit: 650, mq135Warn: 350, mq135Crit: 600, tempWarn: 35, tempCrit: 45 };

    const mq2Level = packet.mq2 >= th.mq2Crit ? 'crit' : (packet.mq2 >= th.mq2Warn ? 'warn' : 'safe');
    const mq135Level = packet.mq135 >= th.mq135Crit ? 'crit' : (packet.mq135 >= th.mq135Warn ? 'warn' : 'safe');
    const tempLevel = packet.temperature >= th.tempCrit ? 'crit' : (packet.temperature >= th.tempWarn ? 'warn' : 'safe');

    // 3. Card C: Update MQ-2 Sensor
    if (this.dom.mq2Val) this.dom.mq2Val.textContent = packet.mq2;
    if (this.dom.mq2VoltVal) this.dom.mq2VoltVal.textContent = `${mq2Voltage.toFixed(2)} V`;
    this._setPillStatus(this.dom.mq2StatusPill, mq2Level, mq2Level === 'crit' ? 'CRITICAL' : (mq2Level === 'warn' ? 'WARNING' : 'NORMAL'));
    if (this.dom.mq2ProgressBar) {
      const pct = Math.min(100, Math.round((packet.mq2 / 1023) * 100));
      this.dom.mq2ProgressBar.style.width = `${pct}%`;
      this.dom.mq2ProgressBar.className = `telemetry-progress-bar bar-${mq2Level}`;
    }

    // 4. Card D: Update MQ-135 Sensor
    if (this.dom.mq135Val) this.dom.mq135Val.textContent = packet.mq135;
    if (this.dom.mq135VoltVal) this.dom.mq135VoltVal.textContent = `${mq135Voltage.toFixed(2)} V`;
    this._setPillStatus(this.dom.mq135StatusPill, mq135Level, mq135Level === 'crit' ? 'CRITICAL' : (mq135Level === 'warn' ? 'WARNING' : 'NORMAL'));
    if (this.dom.mq135ProgressBar) {
      const pct = Math.min(100, Math.round((packet.mq135 / 1023) * 100));
      this.dom.mq135ProgressBar.style.width = `${pct}%`;
      this.dom.mq135ProgressBar.className = `telemetry-progress-bar bar-${mq135Level}`;
    }

    // 5. Card E: Temperature (DHT22)
    const tempFahr = (packet.temperature * 9 / 5) + 32;
    if (this.dom.tempVal) this.dom.tempVal.textContent = packet.temperature.toFixed(1);
    if (this.dom.tempFahrVal) this.dom.tempFahrVal.textContent = `${tempFahr.toFixed(1)} °F`;
    this._setPillStatus(this.dom.tempStatusPill, tempLevel, tempLevel === 'crit' ? 'ELEVATED' : 'OPTIMAL');

    this.tempMin = Math.min(this.tempMin, packet.temperature);
    this.tempMax = Math.max(this.tempMax, packet.temperature);
    if (this.dom.tempMinMax) {
      this.dom.tempMinMax.textContent = `Min: ${this.tempMin.toFixed(1)}°C | Max: ${this.tempMax.toFixed(1)}°C`;
    }

    if (this.dom.tempProgressBar) {
      // Map 0 - 60 C range to 0 - 100%
      const pct = Math.max(0, Math.min(100, Math.round((packet.temperature / 60) * 100)));
      this.dom.tempProgressBar.style.width = `${pct}%`;
      this.dom.tempProgressBar.className = `telemetry-progress-bar bar-${tempLevel}`;
    }

    // 6. Card F: Humidity (DHT22)
    if (this.dom.humVal) this.dom.humVal.textContent = packet.humidity.toFixed(1);
    this.humMin = Math.min(this.humMin, packet.humidity);
    this.humMax = Math.max(this.humMax, packet.humidity);
    if (this.dom.humMinMax) {
      this.dom.humMinMax.textContent = `Min: ${this.humMin.toFixed(1)}% | Max: ${this.humMax.toFixed(1)}%`;
    }

    let comfortText = 'Comfortable';
    let humLevel = 'safe';
    if (packet.humidity < 30) {
      comfortText = 'Low / Dry Air';
      humLevel = 'warn';
    } else if (packet.humidity > 65) {
      comfortText = 'High Humidity / Stuffy';
      humLevel = 'warn';
    }
    if (this.dom.humComfortVal) this.dom.humComfortVal.textContent = comfortText;
    this._setPillStatus(this.dom.humStatusPill, humLevel, comfortText);

    if (this.dom.humProgressBar) {
      this.dom.humProgressBar.style.width = `${Math.min(100, Math.round(packet.humidity))}%`;
      this.dom.humProgressBar.className = `telemetry-progress-bar bar-${humLevel}`;
    }

    // 7. Card A: Overall System Status & Arduino Hardware Indicator Mirror
    const currentStatus = this.alertManager ? this.alertManager.currentState : 'SAFE';
    this._updateOverallSystemCard(currentStatus, timeStr, isDemo);

    // 8. Card B: Connection Details & Metrics
    if (this.dom.lastHeartbeatTime) {
      this.dom.lastHeartbeatTime.textContent = `Last update: ${timeStr}`;
    }

    if (this.dom.packetCountText) {
      const pkts = metrics.packetsReceived || (isDemo ? this.simSampleIndex : 1);
      const errs = metrics.packetErrors || 0;
      this.dom.packetCountText.textContent = `${pkts} pkts \u2022 ${errs} err`;
    }

    if (this.dom.packetLatencyText) {
      this.dom.packetLatencyText.textContent = `Watchdog: Active (${timeStr})`;
    }

    // 9. Card H: Active Sensors
    this._updateSensorHealth(packet);

    // 10. Live OLED Display Hardware Mirror
    this._updateOledMirror(packet, currentStatus);
  }

  _updateOledMirror(packet, status) {
    const th = this.alertManager ? this.alertManager.thresholds : { mq2Warn: 380, mq2Crit: 580, mq135Warn: 320, mq135Crit: 520, tempWarn: 35, tempCrit: 42 };
    const isSmokeCrit = packet.mq2 >= th.mq2Crit;
    const isSmokeWarn = packet.mq2 >= th.mq2Warn;
    const isGasCrit   = packet.mq135 >= th.mq135Crit;
    const isGasWarn   = packet.mq135 >= th.mq135Warn;
    const isTempCrit  = packet.temperature >= th.tempCrit;
    const isTempWarn  = packet.temperature >= th.tempWarn;

    // Header Status Pill on OLED
    if (this.dom.oledHeaderStatus) {
      if (isSmokeCrit && isGasCrit) this.dom.oledHeaderStatus.textContent = '[!HAZARD]';
      else if (isSmokeCrit) this.dom.oledHeaderStatus.textContent = '[!SMOKE!]';
      else if (isGasCrit) this.dom.oledHeaderStatus.textContent = '[! GAS !]';
      else if (isTempCrit) this.dom.oledHeaderStatus.textContent = '[!TEMP !]';
      else if (status === 'WARNING') this.dom.oledHeaderStatus.textContent = '[ WARN  ]';
      else if (status === 'SENSOR ERROR') this.dom.oledHeaderStatus.textContent = '[ ERR!  ]';
      else this.dom.oledHeaderStatus.textContent = '[ SAFE  ]';
    }

    // Body Lines (No ADC)
    if (this.dom.oledLineTemp) {
      const humVal = Math.round(packet.humidity);
      this.dom.oledLineTemp.textContent = `Temp : ${packet.temperature.toFixed(1)} C (${humVal}%) ${isTempCrit ? '!' : ''}`;
    }
    if (this.dom.oledLineSmoke) {
      const tag = isSmokeCrit ? '[CRIT!]' : (isSmokeWarn ? '[WARN]' : '(OK)');
      this.dom.oledLineSmoke.textContent = `Smoke: ${packet.mq2} ${tag}`;
    }
    if (this.dom.oledLineGas) {
      const tag = isGasCrit ? '[CRIT!]' : (isGasWarn ? '[WARN]' : '(OK)');
      this.dom.oledLineGas.textContent = `Gas  : ${packet.mq135} ${tag}`;
    }

    // Footer Bar (Specific Detection Alerts)
    if (this.dom.oledFooter && this.dom.oledFooterText) {
      if (status === 'CRITICAL') {
        this.dom.oledFooter.className = 'oled-footer oled-footer-crit';
        if (isSmokeCrit && isGasCrit) this.dom.oledFooterText.textContent = 'SMOKE & GAS DETECTED';
        else if (isSmokeCrit) this.dom.oledFooterText.textContent = 'DETECTION OF SMOKE!';
        else if (isGasCrit) this.dom.oledFooterText.textContent = 'DETECTION OF GASES!';
        else if (isTempCrit) this.dom.oledFooterText.textContent = 'HIGH TEMP DETECTED!';
        else this.dom.oledFooterText.textContent = 'CRITICAL ALARM ON!';
      } else if (status === 'WARNING') {
        this.dom.oledFooter.className = 'oled-footer oled-footer-warn';
        if (isSmokeWarn) this.dom.oledFooterText.textContent = 'WARN: SMOKE DETECTED';
        else if (isGasWarn) this.dom.oledFooterText.textContent = 'WARN: GAS DETECTED';
        else if (isTempWarn) this.dom.oledFooterText.textContent = 'WARN: ELEVATED TEMP';
        else this.dom.oledFooterText.textContent = 'STATUS: WARN LEVEL';
      } else if (status === 'SENSOR ERROR') {
        this.dom.oledFooter.className = 'oled-footer';
        this.dom.oledFooterText.textContent = 'SENSOR COMM FAULT';
      } else {
        this.dom.oledFooter.className = 'oled-footer';
        this.dom.oledFooterText.textContent = 'AIR QUALITY: NORMAL';
      }
    }
  }

  _updateOverallSystemCard(status, timeStr, isDemo) {
    let pillClass = 'pill-safe';
    let label = 'SAFE';
    let desc = 'All vehicle compartment gas, smoke, and environmental channels are operating within configured baseline parameters.';

    let greenActive = true;
    let yellowActive = false;
    let redActive = false;
    let buzzerState = 'off';

    if (status === 'CRITICAL') {
      pillClass = 'pill-crit';
      label = 'CRITICAL ALARM';
      desc = 'Hazard detected! Combustible gas, dense smoke, or severe thermal limits breached. Arduino OLED alarm and buzzer are triggered!';
      greenActive = false;
      yellowActive = false;
      redActive = true;
      buzzerState = 'critical';
    } else if (status === 'WARNING') {
      pillClass = 'pill-warn';
      label = 'WARNING';
      desc = 'Elevated air contaminants or rising temperature detected. OLED warning and intermittent buzzer active.';
      greenActive = false;
      yellowActive = true;
      redActive = false;
      buzzerState = 'warning';
    } else if (status === 'SENSOR ERROR') {
      pillClass = 'pill-warn';
      label = 'SENSOR ERROR';
      desc = 'Sensor read timeout or bus error on Arduino Uno. Check DHT22 pin D2 or analog wiring.';
      greenActive = false;
      yellowActive = true;
      redActive = true;
      buzzerState = 'off';
    }

    if (isDemo) {
      label += ' (SIM)';
    }

    if (this.dom.systemStatusPill) {
      this.dom.systemStatusPill.className = `card-status-pill ${pillClass}`;
      this.dom.systemStatusPill.textContent = label;
    }
    if (this.dom.systemStatusBadgeLg) {
      this.dom.systemStatusBadgeLg.className = `system-status-badge-lg ${pillClass}`;
    }
    if (this.dom.systemStatusText) {
      this.dom.systemStatusText.textContent = label;
    }
    if (this.dom.systemStatusDesc) {
      this.dom.systemStatusDesc.textContent = desc;
    }

    // Hardware indicator mirrors (OLED Screen and Buzzer Alarm)
    if (this.dom.hwOledStatus) {
      this.dom.hwOledStatus.className = 'hw-led-dot active-green';
    }
    if (this.dom.hwBuzzer) {
      if (buzzerState === 'critical') {
        this.dom.hwBuzzer.className = 'hw-led-dot active-buzzer';
      } else if (buzzerState === 'warning') {
        this.dom.hwBuzzer.className = 'hw-led-dot active-buzzer-warn';
      } else {
        this.dom.hwBuzzer.className = 'hw-led-dot';
      }
    }
    if (this.dom.hwBuzzerLabel) {
      if (buzzerState === 'critical') {
        this.dom.hwBuzzerLabel.textContent = 'D8 Buzzer (Critical Alarm)';
      } else if (buzzerState === 'warning') {
        this.dom.hwBuzzerLabel.textContent = 'D8 Buzzer (Warning Beep)';
      } else {
        this.dom.hwBuzzerLabel.textContent = 'D8 Buzzer (Ready)';
      }
    }
  }

  _updateSensorHealth(packet) {
    if (this.dom.sensorHealthPill) {
      this.dom.sensorHealthPill.className = 'card-status-pill pill-safe';
      this.dom.sensorHealthPill.textContent = 'ALL 5 ONLINE';
    }
    if (this.dom.hwSensorMq2) {
      this.dom.hwSensorMq2.textContent = `${packet.mq2} Level (Active)`;
      this.dom.hwSensorMq2.style.color = '#10b981';
    }
    if (this.dom.hwSensorMq135) {
      this.dom.hwSensorMq135.textContent = `${packet.mq135} Level (Active)`;
      this.dom.hwSensorMq135.style.color = '#10b981';
    }
    if (this.dom.hwSensorDht) {
      this.dom.hwSensorDht.textContent = `${packet.temperature.toFixed(1)}°C / ${packet.humidity.toFixed(1)}% (Active)`;
      this.dom.hwSensorDht.style.color = '#10b981';
    }
    if (this.dom.hwSensorOled) {
      this.dom.hwSensorOled.textContent = '128x64 I2C (Rendering)';
      this.dom.hwSensorOled.style.color = '#10b981';
    }
    if (this.dom.hwSensorBuzzer) {
      if (packet.status === 'CRITICAL') {
        this.dom.hwSensorBuzzer.textContent = 'CRITICAL ALARM (Pin D8)';
        this.dom.hwSensorBuzzer.style.color = '#ef4444';
      } else if (packet.status === 'WARNING') {
        this.dom.hwSensorBuzzer.textContent = 'Warning Chirp (Pin D8)';
        this.dom.hwSensorBuzzer.style.color = '#f59e0b';
      } else {
        this.dom.hwSensorBuzzer.textContent = 'Ready (Pin D8)';
        this.dom.hwSensorBuzzer.style.color = '#10b981';
      }
    }
  }

  _setPillStatus(el, level, text) {
    if (!el) return;
    const map = {
      safe: 'pill-safe',
      warn: 'pill-warn',
      crit: 'pill-crit',
      offline: 'pill-offline'
    };
    el.className = `card-status-pill ${map[level] || 'pill-offline'}`;
    el.textContent = text;
  }

  /**
   * Set UI to connected state
   */
  setConnected(info = {}) {
    if (this.dom.connBadge) {
      this.dom.connBadge.className = 'connection-badge connected';
    }
    if (this.dom.connText) {
      this.dom.connText.textContent = 'DEVICE CONNECTED';
    }
    if (this.dom.serialStatePill) {
      this.dom.serialStatePill.className = 'card-status-pill pill-safe';
      this.dom.serialStatePill.textContent = 'CONNECTED';
    }
    if (this.dom.serialBaudPortText) {
      this.dom.serialBaudPortText.textContent = `${info.baudRate || 115200} bps \u2022 USB Serial`;
    }
    if (this.dom.demoModeBadge) {
      this.dom.demoModeBadge.style.display = 'none';
    }
  }

  /**
   * Set UI to port open waiting for valid telemetry packet
   */
  setPortWaiting(info = {}) {
    if (this.dom.connBadge) {
      this.dom.connBadge.className = 'connection-badge connecting';
    }
    if (this.dom.connText) {
      this.dom.connText.textContent = 'WAITING FOR DATA...';
    }
    if (this.dom.serialStatePill) {
      this.dom.serialStatePill.className = 'card-status-pill pill-warn';
      this.dom.serialStatePill.textContent = 'PORT OPEN (SYNC)';
    }
    if (this.dom.serialBaudPortText) {
      this.dom.serialBaudPortText.textContent = `${info.baudRate || 115200} bps \u2022 Handshake`;
    }
  }

  /**
   * Set UI to disconnected state
   */
  setDisconnected(reason = 'Disconnected') {
    if (this.dom.connBadge) {
      this.dom.connBadge.className = 'connection-badge offline';
    }
    if (this.dom.connText) {
      this.dom.connText.textContent = 'DEVICE OFFLINE';
    }
    if (this.dom.serialStatePill) {
      this.dom.serialStatePill.className = 'card-status-pill pill-offline';
      this.dom.serialStatePill.textContent = 'DISCONNECTED';
    }
    if (this.dom.systemStatusPill) {
      this.dom.systemStatusPill.className = 'card-status-pill pill-offline';
      this.dom.systemStatusPill.textContent = 'OFFLINE';
    }
    if (this.dom.systemStatusBadgeLg) {
      this.dom.systemStatusBadgeLg.className = 'system-status-badge-lg pill-offline';
    }
    if (this.dom.systemStatusText) {
      this.dom.systemStatusText.textContent = 'DEVICE OFFLINE';
    }
    if (this.dom.systemStatusDesc) {
      this.dom.systemStatusDesc.textContent = `Arduino Uno disconnected (${reason}). Connect USB to stream telemetry.`;
    }

    // Reset Hardware indicator mirrors
    [this.dom.hwOledStatus, this.dom.hwBuzzer].forEach(el => {
      if (el) el.className = 'hw-led-dot';
    });
    if (this.dom.hwBuzzerLabel) {
      this.dom.hwBuzzerLabel.textContent = 'D8 Buzzer (Audio Unit)';
    }

    // Reset Sensor Health
    if (this.dom.sensorHealthPill) {
      this.dom.sensorHealthPill.className = 'card-status-pill pill-offline';
      this.dom.sensorHealthPill.textContent = 'OFFLINE';
    }
    [this.dom.hwSensorMq2, this.dom.hwSensorMq135, this.dom.hwSensorDht, this.dom.hwSensorOled, this.dom.hwSensorBuzzer].forEach(el => {
      if (el) {
        el.textContent = 'Disconnected';
        el.style.color = '#94a3b8';
      }
    });

    if (this.dom.packetLatencyText) {
      this.dom.packetLatencyText.textContent = 'Watchdog: Inactive';
    }
  }

  /**
   * Realistic Demo Simulation Mode for offline exploration
   */
  startDemoSimulation(onSample) {
    if (this.isSimulating) return;
    this.isSimulating = true;
    this.simSampleIndex = 0;

    if (this.dom.demoModeBadge) {
      this.dom.demoModeBadge.style.display = 'inline-block';
    }
    if (this.dom.connBadge) {
      this.dom.connBadge.className = 'connection-badge simulated';
    }
    if (this.dom.connText) {
      this.dom.connText.textContent = 'SIMULATOR ACTIVE';
    }
    if (this.dom.serialStatePill) {
      this.dom.serialStatePill.className = 'card-status-pill pill-warn';
      this.dom.serialStatePill.textContent = 'SIMULATED DATA';
    }
    if (this.dom.serialBaudPortText) {
      this.dom.serialBaudPortText.textContent = 'Virtual Simulator \u2022 Demo';
    }

    // Simulation loop running at 1.0 Hz (1000ms)
    this.simTimer = setInterval(() => {
      this.simSampleIndex++;

      // Realistic automotive baseline fluctuations
      const phase = (this.simSampleIndex % 32);
      let simulatedMq2 = 180 + Math.floor(Math.sin(this.simSampleIndex * 0.15) * 30) + Math.floor(Math.random() * 10);
      let simulatedMq135 = 160 + Math.floor(Math.cos(this.simSampleIndex * 0.1) * 25) + Math.floor(Math.random() * 8);
      let simulatedTemp = 25.5 + (Math.sin(this.simSampleIndex * 0.05) * 2.0) + (Math.random() * 0.2);
      let simulatedHum = 52.0 + (Math.cos(this.simSampleIndex * 0.05) * 3.0) + (Math.random() * 0.5);

      // Periodically demonstrate the different alert types:
      if (phase >= 14 && phase <= 18) {
        // Toxic Gas / Air Quality Degradation Alert
        simulatedMq135 = 560 + Math.floor(Math.random() * 40); // Critical Gas Alarm!
      } else if (phase >= 22 && phase <= 26) {
        // Combustible Gas / Smoke Detection Alert
        simulatedMq2 = 680 + Math.floor(Math.random() * 50); // Critical Smoke Alarm!
      } else if (phase >= 28 && phase <= 30) {
        // High Cabin Temperature Stress Alert
        simulatedTemp = 43.5 + (Math.random() * 1.5);
      }

      const th = this.alertManager ? this.alertManager.thresholds : { mq2Warn: 380, mq2Crit: 580, mq135Warn: 320, mq135Crit: 520, tempWarn: 35, tempCrit: 42 };
      let status = 'NORMAL';
      if (simulatedMq2 >= th.mq2Crit || simulatedMq135 >= th.mq135Crit || simulatedTemp >= th.tempCrit) {
        status = 'CRITICAL';
      } else if (simulatedMq2 >= th.mq2Warn || simulatedMq135 >= th.mq135Warn || simulatedTemp >= th.tempWarn) {
        status = 'WARNING';
      }

      const packet = {
        device: 'AutoSense-Uno-Sim',
        mq2: simulatedMq2,
        mq135: simulatedMq135,
        temperature: parseFloat(simulatedTemp.toFixed(1)),
        humidity: parseFloat(simulatedHum.toFixed(1)),
        status: status,
        smoke_alert: simulatedMq2 >= th.mq2Crit,
        gas_alert: simulatedMq135 >= th.mq135Crit,
        temp_alert: simulatedTemp >= th.tempCrit,
        timestamp: new Date()
      };

      if (onSample) {
        onSample(packet);
      }
    }, 1000);
  }

  /**
   * Inject an immediate preset scenario for quick verification and demonstration
   */
  injectPresetScenario(scenarioName, onSample) {
    const presets = {
      safe: {
        mq2: 175,
        mq135: 155,
        temperature: 24.8,
        humidity: 50.0,
        status: 'NORMAL'
      },
      smoke: {
        mq2: 685, // Critical Smoke Alert!
        mq135: 220,
        temperature: 28.0,
        humidity: 46.0,
        status: 'CRITICAL',
        smoke_alert: true
      },
      gas: {
        mq2: 230,
        mq135: 590, // Critical Toxic Gas Alert!
        temperature: 27.2,
        humidity: 49.0,
        status: 'CRITICAL',
        gas_alert: true
      },
      temp: {
        mq2: 195,
        mq135: 180,
        temperature: 44.5, // Critical High Temp Alert!
        humidity: 34.0,
        status: 'CRITICAL',
        temp_alert: true
      },
      multi: {
        mq2: 720, // Multi-Hazard Alert!
        mq135: 640,
        temperature: 43.8,
        humidity: 32.0,
        status: 'CRITICAL',
        smoke_alert: true,
        gas_alert: true,
        temp_alert: true
      }
    };

    const target = presets[scenarioName] || presets.safe;
    const packet = {
      device: 'AutoSense-Preset-Sim',
      mq2: target.mq2,
      mq135: target.mq135,
      temperature: target.temperature,
      humidity: target.humidity,
      status: target.status,
      smoke_alert: Boolean(target.smoke_alert),
      gas_alert: Boolean(target.gas_alert),
      temp_alert: Boolean(target.temp_alert),
      timestamp: new Date()
    };

    if (onSample) {
      onSample(packet);
    }
  }

  stopDemoSimulation() {
    if (!this.isSimulating) return;
    clearInterval(this.simTimer);
    this.simTimer = null;
    this.isSimulating = false;

    if (this.dom.demoModeBadge) {
      this.dom.demoModeBadge.style.display = 'none';
    }
    this.setDisconnected('Simulator stopped');
  }
}
