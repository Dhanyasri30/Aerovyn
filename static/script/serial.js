/**
 * AutoSense — Smart Automotive Gas, Smoke & Air-Quality Monitoring System
 * serial.js — Web Serial API Communication Controller
 *
 * Handles:
 * - navigator.serial port request & configuration
 * - Non-blocking stream decoding with newline-delimited JSON framing
 * - Packet validation & schema enforcement
 * - Connection watchdog / timeout handling
 * - Clean asynchronous teardown & port release
 * - Host-to-device command transmission
 */

class SerialController {
  constructor(options = {}) {
    this.baudRate = options.baudRate || 115200;
    this.port = null;
    this.reader = null;
    this.keepReading = false;
    this.isConnected = false;
    this.isPortOpen = false;

    // Callbacks
    this.onData = options.onData || (() => {});
    this.onConnect = options.onConnect || (() => {});
    this.onDisconnect = options.onDisconnect || (() => {});
    this.onError = options.onError || (() => {});
    this.onPortWaiting = options.onPortWaiting || (() => {});
    this.onWatchdogTimeout = options.onWatchdogTimeout || (() => {});

    // Metrics
    this.totalPacketsReceived = 0;
    this.totalPacketErrors = 0;
    this.lastPacketTimestamp = null;
    this.watchdogTimer = null;
    this.watchdogTimeoutMs = 4000; // 4s without packet triggers watchdog

    // Auto-detect disconnect events (e.g. cable unplugged)
    if (this.isSupported()) {
      navigator.serial.addEventListener('disconnect', (event) => {
        if (this.port && event.target === this.port) {
          console.warn('[Serial] Hardware unplugged event detected');
          this.disconnect('Hardware cable disconnected');
        }
      });
    }
  }

  /**
   * Check if the browser supports the Web Serial API
   */
  isSupported() {
    return 'serial' in navigator && typeof navigator.serial.requestPort === 'function';
  }

  /**
   * Check if running in a secure context (HTTPS or localhost)
   */
  isSecureContext() {
    return window.isSecureContext === true;
  }

  /**
   * Request serial port and begin reading stream
   */
  async connect(selectedBaudRate) {
    if (!this.isSupported()) {
      this.onError('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
      return false;
    }

    if (!this.isSecureContext()) {
      this.onError('Web Serial requires a secure context (HTTPS, localhost, or 127.0.0.1).');
      return false;
    }

    if (this.isPortOpen) {
      console.warn('[Serial] Port is already open.');
      return false;
    }

    if (selectedBaudRate) {
      this.baudRate = parseInt(selectedBaudRate, 10);
    }

    try {
      // 1. Request port from user gesture
      this.port = await navigator.serial.requestPort();
      
      // 2. Open port at configured baud rate
      await this.port.open({
        baudRate: this.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 2048,
        flowControl: 'none'
      });

      this.isPortOpen = true;
      this.keepReading = true;
      this.isConnected = false; // Note: not reported as connected until valid packet arrives!

      const portInfo = this.port.getInfo ? this.port.getInfo() : {};
      this.onPortWaiting({
        baudRate: this.baudRate,
        usbVendorId: portInfo.usbVendorId || 'Arduino',
        usbProductId: portInfo.usbProductId || 'Uno'
      });

      // 3. Start stream processing loop
      this._readStream();
      return true;

    } catch (err) {
      this.isPortOpen = false;
      this.isConnected = false;
      this.port = null;

      if (err.name === 'NotFoundError') {
        // User cancelled the prompt dialog
        console.info('[Serial] Port selection cancelled by user.');
      } else {
        console.error('[Serial] Connection error:', err);
        this.onError(`Serial Connection Failed: ${err.message}`);
      }
      return false;
    }
  }

  /**
   * Continuous stream reader with buffer management
   */
  async _readStream() {
    let lineBuffer = '';
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    this.reader = reader;

    this._startWatchdog();

    try {
      while (this.keepReading) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        if (value) {
          lineBuffer += value;
          const lines = lineBuffer.split(/\r?\n/);
          // Keep whatever incomplete fragment remains at the end
          lineBuffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length > 0) {
              this._processLine(trimmed);
            }
          }
        }
      }
    } catch (err) {
      if (this.keepReading) {
        console.error('[Serial] Stream read error:', err);
        this.onError(`Serial Read Error: ${err.message}`);
      }
    } finally {
      this._stopWatchdog();
      try {
        reader.releaseLock();
      } catch (e) {
        // Ignored during cleanup
      }
    }
  }

  /**
   * Validate and parse a raw JSON line
   */
  _processLine(rawString) {
    // Basic sanity check to avoid parsing arbitrary noise
    if (!rawString.startsWith('{') || !rawString.endsWith('}')) {
      return;
    }

    try {
      const packet = JSON.parse(rawString);

      // Validate packet schema and sensor values
      const validated = this._validatePacket(packet);
      if (!validated) {
        this.totalPacketErrors++;
        return;
      }

      // Attach client-side reception timestamp
      validated.timestamp = new Date();
      validated.raw = rawString;

      this.totalPacketsReceived++;
      this.lastPacketTimestamp = Date.now();

      // First valid packet confirms device is connected & active
      if (!this.isConnected) {
        this.isConnected = true;
        this.onConnect({
          baudRate: this.baudRate,
          device: validated.device || 'AutoSense-Uno'
        });
      }

      // Reset watchdog on each valid packet
      this._resetWatchdog();

      // Dispatch to application
      this.onData(validated);

    } catch (parseErr) {
      this.totalPacketErrors++;
      console.warn('[Serial] JSON parse failure on line:', rawString, parseErr);
    }
  }

  /**
   * Strict packet schema validation
   */
  _validatePacket(p) {
    if (typeof p !== 'object' || p === null) return null;

    // Check for optional command acknowledgement packets from Arduino
    if (p.event === 'config_ack') {
      return p;
    }

    // Required sensor telemetry fields
    if (typeof p.mq2 !== 'number' || isNaN(p.mq2) || p.mq2 < 0 || p.mq2 > 1023) {
      return null;
    }
    if (typeof p.mq135 !== 'number' || isNaN(p.mq135) || p.mq135 < 0 || p.mq135 > 1023) {
      return null;
    }
    if (typeof p.temperature !== 'number' || isNaN(p.temperature) || p.temperature < -40 || p.temperature > 125) {
      return null;
    }
    if (typeof p.humidity !== 'number' || isNaN(p.humidity) || p.humidity < 0 || p.humidity > 100) {
      return null;
    }

    return {
      device: typeof p.device === 'string' ? p.device : 'AutoSense-Uno',
      mq2: Math.round(p.mq2),
      mq135: Math.round(p.mq135),
      temperature: parseFloat(p.temperature.toFixed(1)),
      humidity: parseFloat(p.humidity.toFixed(1)),
      status: typeof p.status === 'string' ? p.status.toUpperCase() : 'NORMAL'
    };
  }

  /**
   * Watchdog timer management
   */
  _startWatchdog() {
    this._stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (this.isConnected && this.lastPacketTimestamp) {
        const elapsed = Date.now() - this.lastPacketTimestamp;
        if (elapsed > this.watchdogTimeoutMs) {
          console.warn(`[Serial Watchdog] No packet for ${elapsed}ms. Marking device offline/timeout.`);
          this.isConnected = false;
          this.onWatchdogTimeout(elapsed);
        }
      }
    }, 1000);
  }

  _resetWatchdog() {
    this.lastPacketTimestamp = Date.now();
  }

  _stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Send JSON command to Arduino over Serial
   */
  async sendCommand(commandObj) {
    if (!this.isPortOpen || !this.port || !this.port.writable) {
      throw new Error('Serial port is not open or writable.');
    }

    const jsonStr = JSON.stringify(commandObj) + '\n';
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonStr);

    const writer = this.port.writable.getWriter();
    try {
      await writer.write(data);
      console.log('[Serial TX]', jsonStr.trim());
      return true;
    } finally {
      writer.releaseLock();
    }
  }

  /**
   * Cleanly disconnect and release all locks
   */
  async disconnect(reason = 'User requested disconnect') {
    if (!this.isPortOpen) {
      return;
    }

    console.info('[Serial] Disconnecting:', reason);
    this.keepReading = false;
    this.isConnected = false;
    this._stopWatchdog();

    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (err) {
      console.warn('[Serial] Error during port closing:', err);
    } finally {
      this.isPortOpen = false;
      this.onDisconnect(reason);
    }
  }

  /**
   * Get telemetry metrics
   */
  getMetrics() {
    return {
      packetsReceived: this.totalPacketsReceived,
      packetErrors: this.totalPacketErrors,
      lastPacketTimestamp: this.lastPacketTimestamp,
      baudRate: this.baudRate,
      isConnected: this.isConnected,
      isPortOpen: this.isPortOpen
    };
  }
}
