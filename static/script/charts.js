/**
 * AutoSense — Smart Automotive Gas, Smoke & Air-Quality Monitoring System
 * charts.js — Real-Time Telemetry Visualization with Chart.js
 *
 * Manages 4 real-time rolling charts:
 * 1. MQ-2 Combustible Gas & Smoke Analog History
 * 2. MQ-135 General Air-Quality History
 * 3. Cabin Temperature History
 * 4. Cabin Relative Humidity History
 */

class ChartController {
  constructor(options = {}) {
    this.maxPoints = options.maxPoints || 40;
    this.charts = {};
    this.isDemoMode = false;

    // Rolling Data Buffers
    this.labels = [];
    this.mq2Data = [];
    this.mq135Data = [];
    this.tempData = [];
    this.humData = [];

    this._initCharts();
  }

  /**
   * Initialize Chart.js instances with industrial telemetry aesthetics
   */
  _initCharts() {
    if (typeof Chart === 'undefined') {
      console.error('[Charts] Chart.js library is not loaded.');
      return;
    }

    // Common styling options
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            font: { family: 'Inter', size: 11, weight: 600 },
            color: '#475569'
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: 'JetBrains Mono', size: 12 },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 8,
          cornerRadius: 6
        }
      },
      scales: {
        x: {
          grid: { color: '#f1f5f9', drawBorder: false },
          ticks: {
            font: { family: 'JetBrains Mono', size: 10 },
            color: '#94a3b8',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6
          }
        },
        y: {
          grid: { color: '#f1f5f9', drawBorder: false },
          ticks: {
            font: { family: 'JetBrains Mono', size: 10 },
            color: '#64748b'
          }
        }
      }
    };

    // 1. MQ-2 Smoke Chart
    const ctxMq2 = document.getElementById('chartMq2Canvas');
    if (ctxMq2) {
      this.charts.mq2 = new Chart(ctxMq2, {
        type: 'line',
        data: {
          labels: this.labels,
          datasets: [{
            label: 'MQ-2 Smoke Level',
            data: this.mq2Data,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: true
          }]
        },
        options: {
          ...baseOptions,
          scales: {
            ...baseOptions.scales,
            y: {
              ...baseOptions.scales.y,
              suggestedMin: 0,
              suggestedMax: 800,
              title: { display: true, text: 'Smoke Level', font: { size: 10, weight: 600 }, color: '#94a3b8' }
            }
          }
        }
      });
    }

    // 2. MQ-135 Air Quality Chart
    const ctxMq135 = document.getElementById('chartMq135Canvas');
    if (ctxMq135) {
      this.charts.mq135 = new Chart(ctxMq135, {
        type: 'line',
        data: {
          labels: this.labels,
          datasets: [{
            label: 'MQ-135 Air Quality Level',
            data: this.mq135Data,
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.12)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: true
          }]
        },
        options: {
          ...baseOptions,
          scales: {
            ...baseOptions.scales,
            y: {
              ...baseOptions.scales.y,
              suggestedMin: 0,
              suggestedMax: 800,
              title: { display: true, text: 'Air Quality Level', font: { size: 10, weight: 600 }, color: '#94a3b8' }
            }
          }
        }
      });
    }

    // 3. Temperature Chart
    const ctxTemp = document.getElementById('chartTempCanvas');
    if (ctxTemp) {
      this.charts.temp = new Chart(ctxTemp, {
        type: 'line',
        data: {
          labels: this.labels,
          datasets: [{
            label: 'Cabin Temp (°C)',
            data: this.tempData,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: true
          }]
        },
        options: {
          ...baseOptions,
          scales: {
            ...baseOptions.scales,
            y: {
              ...baseOptions.scales.y,
              suggestedMin: 15,
              suggestedMax: 45,
              title: { display: true, text: 'Temp (°C)', font: { size: 10, weight: 600 }, color: '#94a3b8' }
            }
          }
        }
      });
    }

    // 4. Humidity Chart
    const ctxHum = document.getElementById('chartHumCanvas');
    if (ctxHum) {
      this.charts.hum = new Chart(ctxHum, {
        type: 'line',
        data: {
          labels: this.labels,
          datasets: [{
            label: 'Cabin RH (%)',
            data: this.humData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: true
          }]
        },
        options: {
          ...baseOptions,
          scales: {
            ...baseOptions.scales,
            y: {
              ...baseOptions.scales.y,
              suggestedMin: 20,
              suggestedMax: 90,
              title: { display: true, text: 'RH (%)', font: { size: 10, weight: 600 }, color: '#94a3b8' }
            }
          }
        }
      });
    }
  }

  /**
   * Append a new valid telemetry sample to all charts
   */
  addDataPoint(packet, isDemo = false) {
    if (!packet) return;

    this.isDemoMode = isDemo;
    const timeLabel = packet.timestamp instanceof Date
      ? packet.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Append to rolling buffers
    this.labels.push(timeLabel);
    this.mq2Data.push(packet.mq2);
    this.mq135Data.push(packet.mq135);
    this.tempData.push(packet.temperature);
    this.humData.push(packet.humidity);

    // Enforce rolling window cap
    while (this.labels.length > this.maxPoints) {
      this.labels.shift();
      this.mq2Data.shift();
      this.mq135Data.shift();
      this.tempData.shift();
      this.humData.shift();
    }

    // Update charts without reinitialization
    Object.values(this.charts).forEach(chart => {
      chart.update('none'); // Update without heavy transitions
    });

    // Update small header readout displays
    const mq2Volt = ((packet.mq2 / 1023.0) * 5.0).toFixed(2);
    const mq135Volt = ((packet.mq135 / 1023.0) * 5.0).toFixed(2);
    const demoTag = isDemo ? ' [SIM]' : '';

    const elMq2 = document.getElementById('chartMq2Val');
    if (elMq2) elMq2.textContent = `${packet.mq2} Level (${mq2Volt} V)${demoTag}`;

    const elMq135 = document.getElementById('chartMq135Val');
    if (elMq135) elMq135.textContent = `${packet.mq135} Level (${mq135Volt} V)${demoTag}`;

    const elTemp = document.getElementById('chartTempVal');
    if (elTemp) elTemp.textContent = `${packet.temperature.toFixed(1)} °C${demoTag}`;

    const elHum = document.getElementById('chartHumVal');
    if (elHum) elHum.textContent = `${packet.humidity.toFixed(1)} % RH${demoTag}`;
  }

  /**
   * Configure rolling window point count
   */
  setWindowSize(size) {
    const parsed = parseInt(size, 10);
    if (!isNaN(parsed) && parsed >= 10 && parsed <= 300) {
      this.maxPoints = parsed;
      while (this.labels.length > this.maxPoints) {
        this.labels.shift();
        this.mq2Data.shift();
        this.mq135Data.shift();
        this.tempData.shift();
        this.humData.shift();
      }
      Object.values(this.charts).forEach(c => c.update());
    }
  }

  /**
   * Clear all chart points
   */
  clearHistory() {
    this.labels.length = 0;
    this.mq2Data.length = 0;
    this.mq135Data.length = 0;
    this.tempData.length = 0;
    this.humData.length = 0;

    Object.values(this.charts).forEach(c => c.update());

    const elMq2 = document.getElementById('chartMq2Val');
    if (elMq2) elMq2.textContent = '-- Level (0.00 V)';
    const elMq135 = document.getElementById('chartMq135Val');
    if (elMq135) elMq135.textContent = '-- Level (0.00 V)';
    const elTemp = document.getElementById('chartTempVal');
    if (elTemp) elTemp.textContent = '-- °C';
    const elHum = document.getElementById('chartHumVal');
    if (elHum) elHum.textContent = '-- % RH';
  }
}
