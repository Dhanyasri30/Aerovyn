/**
 * AutoSense — Smart Automotive Gas, Smoke & Air-Quality Monitoring System
 * app.js — Main Application Orchestrator & UI Binding
 *
 * Coordinates:
 * - Web Serial Controller
 * - Telemetry Chart Controller
 * - Alert & Incident Manager
 * - Dashboard Card Renderer
 * - Settings Persistence & Serial Command Sync
 * - RFC 4180 Compliant CSV Session Telemetry Export
 */

class AutoSenseApp {
  constructor() {
    this.recordedTelemetry = []; // Storage for CSV export (Real device data only)
    this.isDemoActive = false;

    // 1. Initialize Subsystems
    this.alertManager = new AlertManager();
    this.dashboard = new DashboardController(this.alertManager);
    this.charts = new ChartController({ maxPoints: 40 });

    this.serial = new SerialController({
      baudRate: 115200,
      onConnect: (info) => this.handleDeviceConnected(info),
      onPortWaiting: (info) => this.handlePortWaiting(info),
      onData: (packet) => this.handleTelemetryPacket(packet, false),
      onDisconnect: (reason) => this.handleDeviceDisconnected(reason),
      onError: (err) => this.handleSerialError(err),
      onWatchdogTimeout: (elapsed) => this.handleWatchdogTimeout(elapsed)
    });

    // 2. Load Local Settings
    this.settings = this.loadSettings();
    this.alertManager.setThresholds(this.settings);

    // 3. Bind UI Events
    this.bindEvents();
    this.updateSettingsForm();

    // 4. Initialize Active Tab / View from URL hash or default to dashboard
    const initialHash = window.location.hash.replace('#', '');
    if (['dashboard', 'telemetry', 'oled', 'alerts'].includes(initialHash)) {
      this.switchView(initialHash, false);
    } else {
      this.switchView('dashboard', false);
    }

    console.info('[AutoSense] System initialized in Standby mode.');
  }

  /**
   * Bind DOM event listeners
   */
  bindEvents() {
    // Serial Connect Button
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => this.startSerialConnection());
    }

    // Serial Disconnect Button
    const disconnectBtn = document.getElementById('disconnectBtn');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => this.serial.disconnect('User clicked disconnect'));
    }

    // Demo Mode Toggle Button
    const demoBtn = document.getElementById('demoToggleBtn');
    if (demoBtn) {
      demoBtn.addEventListener('click', () => this.toggleDemoMode());
    }

    // Export CSV Button
    const exportBtn = document.getElementById('exportCsvBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportCsv());
    }

    // Chart Controls
    const windowSelect = document.getElementById('chartWindowSelect');
    if (windowSelect) {
      windowSelect.addEventListener('change', (e) => {
        this.charts.setWindowSize(e.target.value);
        const badge = document.getElementById('chartWindowBadge');
        if (badge) badge.textContent = `Rolling ${e.target.value} Samples`;
      });
    }

    const clearChartsBtn = document.getElementById('clearChartsBtn');
    if (clearChartsBtn) {
      clearChartsBtn.addEventListener('click', () => this.charts.clearHistory());
    }

    // Settings Modal
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');
    const syncToArduinoBtn = document.getElementById('syncToArduinoBtn');

    if (openSettingsBtn && settingsModal) {
      openSettingsBtn.addEventListener('click', () => {
        this.updateSettingsForm();
        settingsModal.classList.add('open');
      });
    }

    if (closeSettingsBtn && settingsModal) {
      closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('open');
      });
    }

    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => {
        this.saveSettingsFromForm();
        if (settingsModal) settingsModal.classList.remove('open');
      });
    }

    if (resetDefaultsBtn) {
      resetDefaultsBtn.addEventListener('click', () => this.resetSettingsToDefaults());
    }

    if (syncToArduinoBtn) {
      syncToArduinoBtn.addEventListener('click', () => this.syncThresholdsToArduino());
    }

    // Web Serial Help Modal
    const closeHelpBtn = document.getElementById('closeHelpBtn');
    const confirmHelpBtn = document.getElementById('confirmHelpBtn');
    const helpModal = document.getElementById('serialHelpModal');

    [closeHelpBtn, confirmHelpBtn].forEach(b => {
      if (b && helpModal) {
        b.addEventListener('click', () => helpModal.classList.remove('open'));
      }
    });

    // Audio Mute Toggle
    const muteBtn = document.getElementById('muteToggleBtn');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        const isMuted = !this.alertManager.isMuted;
        this.alertManager.setMuted(isMuted);
        muteBtn.classList.toggle('muted', isMuted);
        const icon = muteBtn.querySelector('img');
        if (icon) {
          icon.src = isMuted ? 'static/assets/icons/volume-x.svg' : 'static/assets/icons/volume-2.svg';
        }
        const text = muteBtn.querySelector('span');
        if (text) {
          text.textContent = isMuted ? 'Muted' : 'Alarm Sound';
        }
      });
    }

    // Quick Simulation Scenario Buttons (Immediate Alarm Demonstrations)
    const scenarioBtns = document.querySelectorAll('[data-scenario]');
    scenarioBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const scenario = e.currentTarget.getAttribute('data-scenario');
        this.dashboard.injectPresetScenario(scenario, (packet) => {
          this.handleTelemetryPacket(packet, true);
        });
      });
    });

    // Tabbed Navigation View Switching
    const navLinks = document.querySelectorAll('.nav-link[data-view]');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = link.getAttribute('data-view');
        this.switchView(targetView);
      });
    });

    // Listen for browser back/forward or hash changes
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (['dashboard', 'telemetry', 'oled', 'alerts'].includes(hash)) {
        this.switchView(hash, false);
      }
    });

    // Close modals on clicking backdrop
    window.addEventListener('click', (e) => {
      if (e.target === settingsModal) settingsModal.classList.remove('open');
      if (e.target === helpModal) helpModal.classList.remove('open');
    });
  }

  /**
   * Switch between Dashboard, Live Telemetry, OLED Mirror, and Alerts views
   */
  switchView(viewName, updateHash = true) {
    const validViews = ['dashboard', 'telemetry', 'oled', 'alerts'];
    const activeView = validViews.includes(viewName) ? viewName : 'dashboard';

    // Update active state on nav links
    const navLinks = document.querySelectorAll('.nav-link[data-view]');
    navLinks.forEach(link => {
      if (link.getAttribute('data-view') === activeView) {
        link.classList.add('active');
        link.setAttribute('aria-selected', 'true');
      } else {
        link.classList.remove('active');
        link.setAttribute('aria-selected', 'false');
      }
    });

    // Toggle view containers
    const views = {
      dashboard: document.getElementById('viewDashboard'),
      telemetry: document.getElementById('viewTelemetry'),
      oled: document.getElementById('viewOled'),
      alerts: document.getElementById('viewAlerts')
    };

    Object.entries(views).forEach(([name, el]) => {
      if (el) {
        if (name === activeView) {
          el.style.display = 'block';
          el.classList.add('active-view');
        } else {
          el.style.display = 'none';
          el.classList.remove('active-view');
        }
      }
    });

    // When switching to telemetry, resize chart canvases
    if (activeView === 'telemetry' && this.charts) {
      setTimeout(() => this.charts.resize(), 50);
    }

    if (updateHash && window.location.hash !== '#' + activeView) {
      window.location.hash = '#' + activeView;
    }

    // Smoothly scroll down towards view area if user is lower on the page
    const mainEl = document.querySelector('.main-content');
    if (mainEl && window.pageYOffset > 100) {
      const yOffset = -80;
      const y = mainEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  }

  /**
   * Start Web Serial Connection to Arduino Uno
   */
  async startSerialConnection() {
    // If simulator is active, stop it first
    if (this.isDemoActive) {
      this.toggleDemoMode(false);
    }

    if (!this.serial.isSupported()) {
      const helpModal = document.getElementById('serialHelpModal');
      if (helpModal) helpModal.classList.add('open');
      return;
    }

    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.innerHTML = '<span>Opening Port...</span>';
    }

    const baudSelect = document.getElementById('settingBaudRate');
    const baud = baudSelect ? parseInt(baudSelect.value, 10) : 115200;

    const success = await this.serial.connect(baud);
    if (!success) {
      if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.innerHTML = `
          <img src="static/assets/icons/usb.svg" class="btn-icon" alt="" aria-hidden="true">
          <span>Connect Device</span>
        `;
      }
    }
  }

  /**
   * Handle when a USB port is opened and waiting for the first valid packet
   */
  handlePortWaiting(info) {
    this.dashboard.setPortWaiting(info);
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    if (connectBtn) connectBtn.style.display = 'none';
    if (disconnectBtn) {
      disconnectBtn.style.display = 'inline-flex';
      disconnectBtn.disabled = false;
    }
  }

  /**
   * Handle first verified packet from Arduino Uno
   */
  handleDeviceConnected(info) {
    this.dashboard.setConnected(info);

    const demoBtn = document.getElementById('demoToggleBtn');
    if (demoBtn) demoBtn.disabled = true; // Disable demo mode while real hardware is connected

    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    if (connectBtn) connectBtn.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';

    console.info('[App] Real Arduino Uno successfully connected at', info.baudRate, 'bps');
  }

  /**
   * Handle stream packets
   */
  handleTelemetryPacket(packet, isDemo = false) {
    // Handle Arduino Command Acknowledgment
    if (packet.event === 'config_ack') {
      const syncBadge = document.getElementById('syncStatusBadge');
      if (syncBadge) {
        syncBadge.textContent = `Arduino Sync Confirmed: ${packet.status} at ${new Date().toLocaleTimeString()}`;
        syncBadge.style.color = '#10b981';
      }
      return;
    }

    // 1. Evaluate alert rules
    this.alertManager.evaluatePacket(packet, isDemo);

    // 2. Update dashboard cards
    const metrics = isDemo ? {} : this.serial.getMetrics();
    this.dashboard.updateTelemetry(packet, isDemo, metrics);

    // 3. Append to real-time rolling charts
    this.charts.addDataPoint(packet, isDemo);

    // 4. Save to session telemetry array ONLY if real hardware data (per specification!)
    if (!isDemo) {
      this.recordedTelemetry.push({
        timestamp: packet.timestamp.toISOString(),
        mq2_level: packet.mq2,
        mq2_voltage: ((packet.mq2 / 1023.0) * 5.0).toFixed(3),
        mq135_level: packet.mq135,
        mq135_voltage: ((packet.mq135 / 1023.0) * 5.0).toFixed(3),
        temperature_c: packet.temperature,
        humidity_pct: packet.humidity,
        status: packet.status
      });

      // Cap in-memory history to 2000 points to avoid memory bloat
      if (this.recordedTelemetry.length > 2000) {
        this.recordedTelemetry.shift();
      }
    }
  }

  /**
   * Handle device disconnection
   */
  handleDeviceDisconnected(reason) {
    this.dashboard.setDisconnected(reason);
    this.alertManager.setOffline(reason);

    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const demoBtn = document.getElementById('demoToggleBtn');

    if (connectBtn) {
      connectBtn.style.display = 'inline-flex';
      connectBtn.disabled = false;
      connectBtn.innerHTML = `
        <img src="static/assets/icons/usb.svg" class="btn-icon" alt="" aria-hidden="true">
        <span>Connect Device</span>
      `;
    }
    if (disconnectBtn) {
      disconnectBtn.style.display = 'none';
    }
    if (demoBtn) {
      demoBtn.disabled = false;
    }
  }

  handleSerialError(err) {
    console.error('[App] Serial Error:', err);
    this.handleDeviceDisconnected(err);
  }

  handleWatchdogTimeout(elapsedMs) {
    console.warn(`[App] Telemetry timeout (${elapsedMs}ms without packet).`);
    this.dashboard.setDisconnected('Telemetry timeout / No data');
    this.alertManager.setOffline('Watchdog: No data arriving from Arduino Uno');
  }

  /**
   * Toggle Demo / Simulator Mode
   */
  toggleDemoMode(forceState) {
    const targetState = forceState !== undefined ? forceState : !this.isDemoActive;

    if (targetState) {
      if (this.serial.isConnected) {
        alert('Cannot start Demo Mode while real Arduino Uno is actively streaming.');
        return;
      }
      this.isDemoActive = true;
      const demoBtn = document.getElementById('demoToggleBtn');
      if (demoBtn) {
        demoBtn.textContent = 'Stop Demo';
        demoBtn.classList.remove('btn-secondary');
        demoBtn.classList.add('btn-danger');
      }
      this.dashboard.startDemoSimulation((packet) => {
        this.handleTelemetryPacket(packet, true);
      });
    } else {
      this.isDemoActive = false;
      const demoBtn = document.getElementById('demoToggleBtn');
      if (demoBtn) {
        demoBtn.textContent = 'Demo Mode';
        demoBtn.classList.remove('btn-danger');
        demoBtn.classList.add('btn-secondary');
      }
      this.dashboard.stopDemoSimulation();
      this.charts.clearHistory();
    }
  }

  /**
   * Export collected real measurements to CSV
   */
  exportCsv() {
    if (this.recordedTelemetry.length === 0) {
      alert('No real device telemetry recorded yet.\nConnect an Arduino Uno and capture data before exporting.');
      return;
    }

    const headers = [
      'Browser_Timestamp_ISO',
      'MQ2_Smoke_Level',
      'MQ2_Voltage_V',
      'MQ135_AirQuality_Level',
      'MQ135_Voltage_V',
      'Temperature_C',
      'Humidity_Pct',
      'System_Status'
    ];

    const rows = this.recordedTelemetry.map(t => [
      `"${t.timestamp}"`,
      t.mq2_level,
      t.mq2_voltage,
      t.mq135_level,
      t.mq135_voltage,
      t.temperature_c,
      t.humidity_pct,
      `"${t.status}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `AutoSense_Telemetry_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.info(`[App] Exported ${rows.length} real telemetry records to CSV.`);
  }

  /**
   * Sync threshold values to Arduino Uno via Serial JSON command
   */
  async syncThresholdsToArduino() {
    if (!this.serial.isConnected) {
      const syncBadge = document.getElementById('syncStatusBadge');
      if (syncBadge) {
        syncBadge.textContent = 'Error: Connect Arduino via USB first to sync runtime thresholds.';
        syncBadge.style.color = '#ef4444';
      }
      return;
    }

    const syncBadge = document.getElementById('syncStatusBadge');
    if (syncBadge) {
      syncBadge.textContent = 'Transmitting threshold command...';
      syncBadge.style.color = '#f59e0b';
    }

    const command = {
      cmd: 'set_thresholds',
      mq2_w: this.settings.mq2Warn,
      mq2_c: this.settings.mq2Crit,
      mq135_w: this.settings.mq135Warn,
      mq135_c: this.settings.mq135Crit,
      temp_w: this.settings.tempWarn,
      temp_c: this.settings.tempCrit
    };

    try {
      await this.serial.sendCommand(command);
    } catch (err) {
      if (syncBadge) {
        syncBadge.textContent = `Sync failed: ${err.message}`;
        syncBadge.style.color = '#ef4444';
      }
    }
  }

  /**
   * Settings Storage & Form Handling
   */
  loadSettings() {
    const defaults = {
      mq2Warn: 380,
      mq2Crit: 580,
      mq135Warn: 320,
      mq135Crit: 520,
      tempWarn: 35.0,
      tempCrit: 42.0,
      baudRate: 115200
    };

    try {
      const saved = localStorage.getItem('autosense_settings');
      if (saved) {
        return { ...defaults, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('[App] Could not load localStorage settings:', e);
    }
    return defaults;
  }

  updateSettingsForm() {
    const s = this.settings;
    const elMq2Warn = document.getElementById('settingMq2Warn');
    const elMq2Crit = document.getElementById('settingMq2Crit');
    const elMq135Warn = document.getElementById('settingMq135Warn');
    const elMq135Crit = document.getElementById('settingMq135Crit');
    const elTempWarn = document.getElementById('settingTempWarn');
    const elTempCrit = document.getElementById('settingTempCrit');
    const elBaud = document.getElementById('settingBaudRate');

    if (elMq2Warn) elMq2Warn.value = s.mq2Warn;
    if (elMq2Crit) elMq2Crit.value = s.mq2Crit;
    if (elMq135Warn) elMq135Warn.value = s.mq135Warn;
    if (elMq135Crit) elMq135Crit.value = s.mq135Crit;
    if (elTempWarn) elTempWarn.value = s.tempWarn;
    if (elTempCrit) elTempCrit.value = s.tempCrit;
    if (elBaud) elBaud.value = s.baudRate;
  }

  saveSettingsFromForm() {
    const elMq2Warn = document.getElementById('settingMq2Warn');
    const elMq2Crit = document.getElementById('settingMq2Crit');
    const elMq135Warn = document.getElementById('settingMq135Warn');
    const elMq135Crit = document.getElementById('settingMq135Crit');
    const elTempWarn = document.getElementById('settingTempWarn');
    const elTempCrit = document.getElementById('settingTempCrit');
    const elBaud = document.getElementById('settingBaudRate');

    const newSettings = {
      mq2Warn: parseInt(elMq2Warn ? elMq2Warn.value : 380, 10),
      mq2Crit: parseInt(elMq2Crit ? elMq2Crit.value : 580, 10),
      mq135Warn: parseInt(elMq135Warn ? elMq135Warn.value : 320, 10),
      mq135Crit: parseInt(elMq135Crit ? elMq135Crit.value : 520, 10),
      tempWarn: parseFloat(elTempWarn ? elTempWarn.value : 35.0),
      tempCrit: parseFloat(elTempCrit ? elTempCrit.value : 42.0),
      baudRate: parseInt(elBaud ? elBaud.value : 115200, 10)
    };

    // Validation
    if (newSettings.mq2Warn >= newSettings.mq2Crit) {
      alert('MQ-2 Warning threshold must be lower than Critical threshold.');
      return;
    }
    if (newSettings.mq135Warn >= newSettings.mq135Crit) {
      alert('MQ-135 Warning threshold must be lower than Critical threshold.');
      return;
    }
    if (newSettings.tempWarn >= newSettings.tempCrit) {
      alert('Temperature Warning threshold must be lower than Critical threshold.');
      return;
    }

    this.settings = newSettings;
    this.alertManager.setThresholds(newSettings);

    try {
      localStorage.setItem('autosense_settings', JSON.stringify(newSettings));
    } catch (e) {
      // Ignored
    }

    console.info('[App] New settings applied:', newSettings);
  }

  resetSettingsToDefaults() {
    const defaults = {
      mq2Warn: 380,
      mq2Crit: 580,
      mq135Warn: 320,
      mq135Crit: 520,
      tempWarn: 35.0,
      tempCrit: 42.0,
      baudRate: 115200
    };
    this.settings = defaults;
    this.updateSettingsForm();
    this.alertManager.setThresholds(defaults);
    try {
      localStorage.removeItem('autosense_settings');
    } catch (e) {}
  }

  acknowledgeIncident(idx) {
    this.alertManager.acknowledgeIncident(idx);
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.autoSenseApp = new AutoSenseApp();
});
