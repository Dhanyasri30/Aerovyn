/**
 * AutoSense — Smart Automotive Gas, Smoke & Air-Quality Monitoring System
 * alerts.js — System Alert & Incident Management Engine
 *
 * Handles:
 * - Real-time multi-threshold condition evaluation
 * - Alert states: SAFE, WARNING, CRITICAL, SENSOR ERROR, DEVICE OFFLINE
 * - Persistent incident history log with acknowledgement
 * - Dynamic warning banner updates
 * - Web Audio API non-intrusive alert tone generator
 */

class AlertManager {
  constructor(options = {}) {
    // Configurable Thresholds (Calibrated Defaults)
    this.thresholds = {
      mq2Warn: options.mq2Warn || 380,
      mq2Crit: options.mq2Crit || 580,
      mq135Warn: options.mq135Warn || 320,
      mq135Crit: options.mq135Crit || 520,
      tempWarn: options.tempWarn || 35.0,
      tempCrit: options.tempCrit || 42.0
    };

    this.activeAlerts = [];
    this.alertHistory = [];
    this.currentState = 'DEVICE OFFLINE';
    this.acknowledgedAlertIds = new Set();
    this.isMuted = false;

    // DOM Elements
    this.banner = document.getElementById('alertBanner');
    this.bannerIcon = document.getElementById('bannerIcon');
    this.bannerMessage = document.getElementById('bannerMessage');
    this.bannerAckBtn = document.getElementById('bannerAckBtn');
    this.tableBody = document.getElementById('alertsTableBody');
    this.countBadge = document.getElementById('alertLogCountBadge');
    this.activeCountPill = document.getElementById('activeAlertCountPill');
    this.activeListEl = document.getElementById('activeAlertsList');

    this._bindEvents();
  }

  _bindEvents() {
    if (this.bannerAckBtn) {
      this.bannerAckBtn.addEventListener('click', () => this.acknowledgeActiveAlerts());
    }

    const clearBtn = document.getElementById('clearAlertsBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearHistory());
    }
  }

  /**
   * Set mute audio state
   */
  setMuted(muted) {
    this.isMuted = Boolean(muted);
  }

  /**
   * Update operational thresholds
   */
  setThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    console.info('[AlertManager] Thresholds updated:', this.thresholds);
  }

  /**
   * Evaluate a telemetry packet against configured thresholds
   */
  evaluatePacket(packet, isDemo = false) {
    if (!packet) return;

    const detectedAlerts = [];

    // 1. Check MQ-2 Combustible Gas / Smoke (Clean readings, no ADC)
    if (packet.mq2 >= this.thresholds.mq2Crit) {
      detectedAlerts.push({
        id: `mq2_crit_${Date.now()}`,
        key: 'mq2_crit',
        severity: 'CRITICAL',
        sensor: 'MQ-2 Gas/Smoke',
        value: `${packet.mq2} Level`,
        limit: `>= ${this.thresholds.mq2Crit} Level`,
        message: 'DETECTION OF SMOKE! Combustible gas or dense smoke detected exceeding critical threshold.'
      });
    } else if (packet.mq2 >= this.thresholds.mq2Warn) {
      detectedAlerts.push({
        id: `mq2_warn_${Date.now()}`,
        key: 'mq2_warn',
        severity: 'WARNING',
        sensor: 'MQ-2 Gas/Smoke',
        value: `${packet.mq2} Level`,
        limit: `>= ${this.thresholds.mq2Warn} Level`,
        message: 'Elevated smoke or hydrocarbon fumes detected above normal baseline.'
      });
    }

    // 2. Check MQ-135 Air Quality (Clean readings, no ADC)
    if (packet.mq135 >= this.thresholds.mq135Crit) {
      detectedAlerts.push({
        id: `mq135_crit_${Date.now()}`,
        key: 'mq135_crit',
        severity: 'CRITICAL',
        sensor: 'MQ-135 Air Quality',
        value: `${packet.mq135} Level`,
        limit: `>= ${this.thresholds.mq135Crit} Level`,
        message: 'DETECTION OF GASES! Hazardous volatile gas or toxic fume concentration exceeds critical limit.'
      });
    } else if (packet.mq135 >= this.thresholds.mq135Warn) {
      detectedAlerts.push({
        id: `mq135_warn_${Date.now()}`,
        key: 'mq135_warn',
        severity: 'WARNING',
        sensor: 'MQ-135 Air Quality',
        value: `${packet.mq135} Level`,
        limit: `>= ${this.thresholds.mq135Warn} Level`,
        message: 'Moderate cabin air degradation detected inside vehicle compartment.'
      });
    }

    // 3. Check Temperature (DHT22)
    if (packet.temperature >= this.thresholds.tempCrit) {
      detectedAlerts.push({
        id: `temp_crit_${Date.now()}`,
        key: 'temp_crit',
        severity: 'CRITICAL',
        sensor: 'Cabin Temp (DHT22)',
        value: `${packet.temperature.toFixed(1)} °C`,
        limit: `>= ${this.thresholds.tempCrit} °C`,
        message: 'HIGH TEMPERATURE DETECTED! Critical cabin heat threshold breached.'
      });
    } else if (packet.temperature >= this.thresholds.tempWarn) {
      detectedAlerts.push({
        id: `temp_warn_${Date.now()}`,
        key: 'temp_warn',
        severity: 'WARNING',
        sensor: 'Cabin Temp (DHT22)',
        value: `${packet.temperature.toFixed(1)} °C`,
        limit: `>= ${this.thresholds.tempWarn} °C`,
        message: 'Elevated cabin temperature detected.'
      });
    }

    // 4. Check for Sensor Hardware Error reported by Arduino
    if (packet.status === 'SENSOR_ERROR') {
      detectedAlerts.push({
        id: `sensor_err_${Date.now()}`,
        key: 'sensor_err',
        severity: 'SENSOR ERROR',
        sensor: 'Hardware Sensor Bus',
        value: 'CHECKSUM_FAIL',
        limit: 'Valid Bus Read',
        message: 'DHT22 or analog sensor communication read timeout on Arduino Uno.'
      });
    }

    this._applyAlertState(detectedAlerts, isDemo);
  }

  /**
   * Apply system state and log incident entries
   */
  _applyAlertState(alerts, isDemo = false) {
    this.activeAlerts = alerts;

    // Determine highest severity
    let state = 'SAFE';
    if (alerts.some(a => a.severity === 'CRITICAL')) {
      state = 'CRITICAL';
    } else if (alerts.some(a => a.severity === 'SENSOR ERROR')) {
      state = 'SENSOR ERROR';
    } else if (alerts.some(a => a.severity === 'WARNING')) {
      state = 'WARNING';
    }

    this.currentState = state;

    // Record new alerts in history
    alerts.forEach(alert => {
      // Check if this condition is already in history within last 10 seconds to avoid flooding
      const recent = this.alertHistory.find(h => h.key === alert.key && (Date.now() - h.timestampMs < 10000));
      if (!recent) {
        const historyItem = {
          ...alert,
          timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          timestampMs: Date.now(),
          acknowledged: false,
          isDemo: isDemo
        };
        this.alertHistory.unshift(historyItem);
        // Keep max 50 log items
        if (this.alertHistory.length > 50) this.alertHistory.pop();
        this._renderTable();

        if (state === 'CRITICAL') {
          this._playBeep();
        }
      }
    });

    this._updateBanner(state, alerts);
    this._updateActiveList(alerts);
  }

  /**
   * Set state when disconnected
   */
  setOffline(reason = 'Device disconnected') {
    this.currentState = 'DEVICE OFFLINE';
    this.activeAlerts = [];
    this._updateBanner('DEVICE OFFLINE', [{ message: reason }]);
    this._updateActiveList([]);
  }

  /**
   * Update top alert banner UI
   */
  _updateBanner(state, alerts) {
    if (!this.banner) return;

    this.banner.className = 'alert-banner';

    switch (state) {
      case 'CRITICAL':
        this.banner.style.display = 'flex';
        this.banner.classList.add('state-critical');
        if (this.bannerIcon) this.bannerIcon.src = 'static/assets/icons/alert-triangle.svg';
        if (this.bannerMessage) {
          const first = alerts[0];
          this.bannerMessage.innerHTML = `<strong>CRITICAL ALERT:</strong> ${first ? first.message : 'Sensor limits breached!'}`;
        }
        if (this.bannerAckBtn) this.bannerAckBtn.style.display = 'inline-block';
        break;

      case 'WARNING':
        this.banner.style.display = 'flex';
        this.banner.classList.add('state-warning');
        if (this.bannerIcon) this.bannerIcon.src = 'static/assets/icons/alert-triangle.svg';
        if (this.bannerMessage) {
          const first = alerts[0];
          this.bannerMessage.innerHTML = `<strong>SYSTEM WARNING:</strong> ${first ? first.message : 'Elevated readings detected.'}`;
        }
        if (this.bannerAckBtn) this.bannerAckBtn.style.display = 'inline-block';
        break;

      case 'SENSOR ERROR':
        this.banner.style.display = 'flex';
        this.banner.classList.add('state-warning');
        if (this.bannerIcon) this.bannerIcon.src = 'static/assets/icons/x-circle.svg';
        if (this.bannerMessage) {
          this.bannerMessage.innerHTML = '<strong>HARDWARE NOTICE:</strong> Sensor read fault detected on Arduino Uno bus.';
        }
        if (this.bannerAckBtn) this.bannerAckBtn.style.display = 'inline-block';
        break;

      case 'DEVICE OFFLINE':
      case 'SAFE':
      default:
        // Hide the banner completely so no standby box clutters the UI
        this.banner.style.display = 'none';
        if (this.bannerAckBtn) this.bannerAckBtn.style.display = 'none';
        break;
    }
  }

  /**
   * Update active alert card list
   */
  _updateActiveList(alerts) {
    if (this.activeCountPill) {
      if (alerts.length > 0) {
        this.activeCountPill.className = alerts.some(a => a.severity === 'CRITICAL') ? 'card-status-pill pill-crit' : 'card-status-pill pill-warn';
        this.activeCountPill.textContent = `${alerts.length} ACTIVE`;
      } else {
        this.activeCountPill.className = 'card-status-pill pill-safe';
        this.activeCountPill.textContent = '0 ACTIVE';
      }
    }

    if (this.activeListEl) {
      if (alerts.length === 0) {
        this.activeListEl.innerHTML = `
          <div style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">
            No critical or warning alerts active.
          </div>
        `;
      } else {
        this.activeListEl.innerHTML = alerts.map(a => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.35rem 0.5rem; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; margin-bottom: 0.35rem; font-size: 0.775rem;">
            <div>
              <strong>${a.sensor}:</strong> ${a.value} (${a.severity})
            </div>
            <span style="font-family: var(--font-mono); color: #be123c; font-weight: 700;">${a.limit}</span>
          </div>
        `).join('');
      }
    }
  }

  /**
   * Render the alert incident history table
   */
  _renderTable() {
    if (!this.tableBody) return;

    if (this.alertHistory.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty-state">
            No alerts recorded yet. Incidents will appear here when sensor thresholds are crossed.
          </td>
        </tr>
      `;
      if (this.countBadge) this.countBadge.textContent = '0 Recorded';
      return;
    }

    if (this.countBadge) this.countBadge.textContent = `${this.alertHistory.length} Recorded`;

    this.tableBody.innerHTML = this.alertHistory.map((item, idx) => {
      const tagClass = item.severity === 'CRITICAL' ? 'tag-crit' : (item.severity === 'WARNING' ? 'tag-warn' : 'tag-error');
      const isAck = item.acknowledged;
      return `
        <tr>
          <td style="font-family: var(--font-mono);">${item.timestamp}</td>
          <td><span class="alert-tag ${tagClass}">${item.severity}</span></td>
          <td><strong>${item.sensor}</strong></td>
          <td style="font-family: var(--font-mono);">${item.value}</td>
          <td style="font-family: var(--font-mono); color: var(--text-muted);">${item.limit}</td>
          <td>
            <span style="font-size: 0.75rem; font-weight: 600; color: ${isAck ? '#64748b' : '#b91c1c'};">
              ${isAck ? 'ACKNOWLEDGED' : 'ACTIVE CONDITION'}
            </span>
          </td>
          <td>
            ${!isAck ? `
              <button type="button" class="btn btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.725rem;" onclick="window.autoSenseApp.acknowledgeIncident(${idx})">
                Acknowledge
              </button>
            ` : '<span style="color: #94a3b8; font-size: 0.75rem;">Cleared</span>'}
          </td>
        </tr>
      `;
    }).join('');
  }

  acknowledgeActiveAlerts() {
    this.alertHistory.forEach(item => { item.acknowledged = true; });
    this._renderTable();
    if (this.bannerAckBtn) this.bannerAckBtn.style.display = 'none';
  }

  acknowledgeIncident(idx) {
    if (this.alertHistory[idx]) {
      this.alertHistory[idx].acknowledged = true;
      this._renderTable();
    }
  }

  clearHistory() {
    this.alertHistory = [];
    this._renderTable();
  }

  /**
   * Pulsing acoustic alert tone for critical smoke / gas alarms
   */
  _playBeep() {
    if (this.isMuted) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // First beep (2.4 kHz like Arduino buzzer)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(2400, ctx.currentTime);
      gain1.gain.setValueAtTime(0.08, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.12);

      // Second beep
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(2400, ctx.currentTime + 0.18);
      gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.18);
      osc2.stop(ctx.currentTime + 0.32);
    } catch (e) {
      // Audio autoplay policy might prevent sound before user gesture
    }
  }
}
