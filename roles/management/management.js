// ═══════════════════════════════════════════
// SUPABASE DATABASE CONNECTION
// ═══════════════════════════════════════════
const DB_CONFIG = window.CONFIG?.database || {
  url: 'https://hqptxgzpzuhsrybuyjoy.supabase.co',
  anonKey: 'sb_publishable_Vn85SyMOd3cToHzCliO5Jg_AX2BO_xY',
  table: 'air_quality_readings',
  refreshInterval: 30000,
  fetchLimit: 10
};

const DB_TABLES = window.CONFIG?.tables || {
  readings: 'air_quality_readings',
  devices: 'devices',
  notificationUsers: 'notification_users',
  smsNotifications: 'sms_notifications',
  systemUsers: 'system_users',
  hourlyStats: 'hourly_stats',
  activity: 'system_activity'
};

// ═══════════════════════════════════════════
// TOAST NOTIFICATION SYSTEM
// ═══════════════════════════════════════════
const TOAST_ICONS = {
  success: '✅',
  info:    'ℹ️',
  warn:    '⚠️',
  danger:  '🚨'
};

function showToast(type = 'info', title = '', message = '', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || 'ℹ️'}</span>
    <div class="toast-body">
      ${title ? `<div class="toast-title">${title}</div>` : ''}
      ${message ? `<div class="toast-msg">${message}</div>` : ''}
    </div>
    <button class="toast-close" onclick="dismissToast(this.parentElement)">✕</button>
    <div class="toast-progress" style="animation-duration:${duration}ms;"></div>
  `;

  container.appendChild(toast);

  const timer = setTimeout(() => dismissToast(toast), duration);
  toast._timer = timer;
}

function dismissToast(toast) {
  if (!toast || toast._dismissed) return;
  toast._dismissed = true;
  clearTimeout(toast._timer);
  toast.classList.add('toast-out');
  setTimeout(() => toast.remove(), 220);
}

const Database = {
  async fetchLatestReadings(limit = 10) {
    try {
      const url = `${DB_CONFIG.url}/rest/v1/${DB_TABLES.readings}?order=created_at.desc&limit=${limit}`;
      console.log('📡 Fetching readings from:', url);
      const response = await fetch(url, {
        headers: {
          'apikey': DB_CONFIG.anonKey,
          'Authorization': `Bearer ${DB_CONFIG.anonKey}`
        }
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
      const data = await response.json();
      console.log('✅ Readings fetched:', data?.length || 0, 'rows');
      clearConnError();
      return data;
    } catch (error) {
      console.error('❌ Database fetch error:', error);
      showConnError(error.message);
      return null;
    }
  },
  async fetchHourlyStats(hours = 24) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.hourlyStats}?order=hour.desc&limit=${hours}`,
        {
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`
          }
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Hourly stats fetch error:', error);
      return null;
    }
  },
  async getDevices() {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.devices}?order=created_at.desc`,
        {
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`
          }
        }
      );
      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
      const data = await response.json();
      clearConnError();
      return data;
    } catch (error) {
      console.error('❌ Error fetching devices:', error);
      showConnError(error.message);
      return [];
    }
  },
  async getLatestDeviceLocation(deviceId) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.readings}?device_id=eq.${deviceId}&order=created_at.desc&limit=1`,
        {
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`
          }
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Error fetching latest device location:', error);
      return null;
    }
  },

  async logActivity(activity) {
    try {
      await fetch(`${DB_CONFIG.url}/rest/v1/${DB_TABLES.activity}`, {
        method: 'POST',
        headers: {
          'apikey': DB_CONFIG.anonKey,
          'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          ...activity,
          actor: activity.actor || 'Manager'
        })
      });
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  },

  async saveMaintenanceLog(log) {
    try {
      const response = await fetch(`${DB_CONFIG.url}/rest/v1/maintenance_logs`, {
        method: 'POST',
        headers: {
          'apikey': DB_CONFIG.anonKey,
          'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          device_id:   log.deviceId,
          type:        log.type,
          components:  log.components,
          notes:       log.notes,
          status:      log.status,
          performed_by: log.actor || 'Manager'
        })
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('❌ Error saving maintenance log:', error);
      throw error;
    }
  },

  async fetchMaintenanceLogs(deviceId = null, limit = 50) {
    try {
      let url = `${DB_CONFIG.url}/rest/v1/maintenance_logs?order=created_at.desc&limit=${limit}`;
      if (deviceId) url += `&device_id=eq.${encodeURIComponent(deviceId)}`;
      const response = await fetch(url, {
        headers: {
          'apikey': DB_CONFIG.anonKey,
          'Authorization': `Bearer ${DB_CONFIG.anonKey}`
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('❌ Error fetching maintenance logs:', error);
      return [];
    }
  },

  async fetchActivity(limit = 20) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.activity}?order=created_at.desc&limit=${limit}`,
        {
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`
          }
        }
      );
      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
      const data = await response.json();
      clearConnError();
      return data;
    } catch (error) {
      console.error('❌ Activity fetch error:', error);
      showConnError(error.message);
      return [];
    }
  }
};

let devices = [
  { id:'AW-001', name:'Air Quality Monitor', location:'Your Location', lat:8.4542, lng:124.6319, status:'online', aqi:0, co2:0, temp:0, hum:0, nh3:0, battery:100, lastSeen:'Just now', threshold:100, alerts:0 }
];
let alertLog = [
  { type:'success', msg:'System initialized successfully', time:'Just now' },
  { type:'info', msg:'Device AW-001 connected', time:'1m ago' }
];
let maps = {};
let markers = {};
// NOTE: Device map UI removed from management dashboard; keep vars for backward compatibility.

let modalMap = null;
let modalMarker = null;

function showConnError(msg) {
  const banner = document.getElementById('conn-error-banner');
  if (banner) { banner.textContent = 'Data fetch failed: ' + msg; banner.style.display = 'block'; }
  const devBanner = document.getElementById('device-conn-error');
  if (devBanner) { devBanner.textContent = 'Data fetch failed: ' + msg; devBanner.style.display = 'block'; }
}
function clearConnError() {
  const banner = document.getElementById('conn-error-banner');
  if (banner) banner.style.display = 'none';
  const devBanner = document.getElementById('device-conn-error');
  if (devBanner) devBanner.style.display = 'none';
}

function formatTimeAgo(isoString) {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function aqiColor(aqi) {
  if (aqi <= 50) return '#22c55e';
  if (aqi <= 100) return '#f59e0b';
  if (aqi <= 150) return '#f97316';
  if (aqi <= 200) return '#ef4444';
  return '#a855f7';
}

function aqiClass(aqi) {
  if (aqi <= 50) return 'aqi-good';
  if (aqi <= 100) return 'aqi-moderate';
  if (aqi <= 150) return 'aqi-unhealthy';
  if (aqi <= 200) return 'aqi-very';
  return 'aqi-hazardous';
}

function aqiLabel(aqi) {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy';
  if (aqi <= 200) return 'Very Unhealthy';
  return 'Hazardous';
}

function componentStatusFromLatestReading(device, latest) {
  // Heuristic component status based on presence of latest reading fields.
  // Returns: { esp32, dht11, mq135, gps, sim900 }
  const nowOk = latest?.created_at ? (Date.now() - new Date(latest.created_at).getTime()) <= (90 * 1000) : false;

  return {
    esp32: {
      ok: nowOk,
      label: nowOk ? 'OK' : 'Offline',
      color: nowOk ? 'var(--green)' : 'var(--red)'
    },
    dht11: {
      ok: nowOk && latest?.temperature !== null && latest?.temperature !== undefined && latest?.humidity !== null && latest?.humidity !== undefined,
      label: (nowOk && latest?.temperature !== null && latest?.humidity !== null) ? 'OK' : 'Fail',
      color: (nowOk && latest?.temperature !== null && latest?.humidity !== null) ? 'var(--teal)' : 'var(--red)'
    },
    mq135: {
      ok: nowOk && (latest?.mq135_raw !== null && latest?.mq135_raw !== undefined || latest?.aqi_value !== null && latest?.aqi_value !== undefined),
      label: (nowOk && (latest?.mq135_raw !== null || latest?.aqi_value !== null)) ? 'OK' : 'Fail',
      color: (nowOk && (latest?.mq135_raw !== null || latest?.aqi_value !== null)) ? 'var(--accent)' : 'var(--red)'
    },
    gps: {
      ok: nowOk && latest?.latitude !== null && latest?.latitude !== undefined && latest?.longitude !== null && latest?.longitude !== undefined,
      label: (nowOk && latest?.latitude !== null && latest?.longitude !== null) ? 'OK' : 'Fail',
      color: (nowOk && latest?.latitude !== null && latest?.longitude !== null) ? '#60a5fa' : 'var(--red)'
    },
    sim900: {
      ok: nowOk,
      label: nowOk ? 'OK' : 'Offline',
      color: nowOk ? 'var(--yellow)' : 'var(--red)'
    }
  };
}

function getDeviceHealthStatus(device, latest) {
  // Returns: 'active' | 'inactive' | 'needs_attention' | 'maintenance'
  if (device.status === 'maintenance') return 'maintenance';

  const lastCreatedAt = latest?.created_at ? new Date(latest.created_at).getTime() : null;
  const isAlive = lastCreatedAt ? (Date.now() - lastCreatedAt) <= (90 * 1000) : false;
  const hasSensorData = latest?.temperature !== null && latest?.humidity !== null && (latest?.mq135_raw !== null || latest?.aqi_value !== null);
  const lowBattery = (device.battery || 100) < 20;
  const highAqi = (latest?.aqi_value || device.aqi || 0) > (device.threshold || 100);

  if (!isAlive) return 'inactive';
  if (!hasSensorData || lowBattery || highAqi) return 'needs_attention';
  return 'active';
}

function healthStatusBadge(status) {
  const map = {
    active: { label: 'Active', class: 'status-online', color: 'var(--green)' },
    inactive: { label: 'Inactive', class: 'status-offline', color: 'var(--red)' },
    needs_attention: { label: 'Needs Attention', class: 'status-offline', color: 'var(--orange)' },
    maintenance: { label: 'Maintenance', class: 'status-maintenance', color: 'var(--yellow)' }
  };
  const s = map[status] || map.inactive;
  return `<span class="status-badge ${s.class}" style="background:${s.color}20;color:${s.color};border:1px solid ${s.color}40;">${s.label}</span>`;
}

function componentDot(st) {
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${st.color};font-weight:500;"><span style="width:7px;height:7px;border-radius:50%;background:${st.color};display:inline-block;"></span>${st.label}</span>`;
}


function statusColor(status) {
  return status === 'online' ? 'var(--green)' : status === 'offline' ? 'var(--red)' : 'var(--yellow)';
}

function showSection(section, element) {
  const sectionEl = document.getElementById(`${section}-section`);
  if (!sectionEl) {
    console.warn('⚠️ Section not found:', section, '- redirecting to overview');
    section = 'overview';
  }
  window.location.hash = section;
  document.querySelectorAll('[id$="-section"]').forEach(s => s.style.display = 'none');
  const targetEl = document.getElementById(`${section}-section`);
  if (targetEl) targetEl.style.display = 'block';
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  if (element) element.classList.add('active');
  if (section === 'overview') loadDashboard();
  if (section === 'devices') loadAllDevices();
  if (section === 'alerts') loadAlerts();
  if (section === 'reports') loadReports();
}

async function loadDashboard() {
  console.log('🔄 loadDashboard() started');
  try {
    const readings = await Database.fetchLatestReadings(10);
    console.log('📊 loadDashboard: readings =', readings);

    if (readings && readings.length > 0) {
      const latest = readings[0];
      devices[0] = {
        ...devices[0],
        aqi: latest.aqi_value || 0,
        temp: latest.temperature || 0,
        hum: latest.humidity || 0,
        co2: latest.co2_ppm ? Math.round(latest.co2_ppm) : Math.round((latest.mq135_raw || 0) * 0.12),
        nh3: latest.nh3_ppm ? latest.nh3_ppm.toFixed(2) : '--',
        benzene: latest.benzene_ppm ? latest.benzene_ppm.toFixed(3) : '--',
        lastSeen: 'Just now'
      };
    } else {
      console.warn('⚠️ No readings returned from database');
    }

    // Compute fleet health metrics
    const healthMap = new Map();
  devices.forEach(dev => {
    const latest = readings && readings.find(r => r.device_id === dev.id) || (readings && readings.length > 0 ? readings[0] : null);
    healthMap.set(dev.id, getDeviceHealthStatus(dev, latest));
  });

  const activeCount = Array.from(healthMap.values()).filter(s => s === 'active').length;
  const inactiveCount = Array.from(healthMap.values()).filter(s => s === 'inactive').length;
  const needsAttentionCount = Array.from(healthMap.values()).filter(s => s === 'needs_attention').length;
  const maintenanceCount = devices.filter(d => d.status === 'maintenance').length;

  // Fleet Status Metrics
  const fleetMetrics = document.getElementById('fleet-metrics');
  if (fleetMetrics) {
    fleetMetrics.innerHTML = [
      { label: 'Active Devices', val: activeCount, sub: `${devices.length} total`, color: 'var(--green)', icon: '✓' },
      { label: 'Inactive Devices', val: inactiveCount, sub: 'No recent data', color: 'var(--red)', icon: '✕' },
      { label: 'Needs Attention', val: needsAttentionCount, sub: 'Requires action', color: 'var(--orange)', icon: '!' },
      { label: 'In Maintenance', val: maintenanceCount, sub: 'Scheduled work', color: 'var(--yellow)', icon: '🔧' }
    ].map(m => `
      <div class="metric-card" style="border-left:3px solid ${m.color};">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:16px;">${m.icon}</span>
          <div class="mc-label">${m.label}</div>
        </div>
        <div class="mc-value" style="color:${m.color};">${m.val}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">${m.sub}</div>
      </div>
    `).join('');
  }

  // Device Health Monitor Table
  try {
    const healthTable = document.getElementById('device-health-table');
    if (healthTable) {
      const tbody = healthTable.querySelector('tbody');
      if (tbody) {
        tbody.innerHTML = devices.map(dev => {
          const latest = readings && readings.find(r => r.device_id === dev.id) || (readings && readings.length > 0 ? readings[0] : null);
          const health = getDeviceHealthStatus(dev, latest);
          const st = componentStatusFromLatestReading(dev, latest);
          const lastSeen = latest?.created_at ? formatTimeAgo(latest.created_at) : (dev.lastSeen || 'Never');
          return `
            <tr>
              <td>
                <div style="font-weight:600;font-size:12px;">${dev.name}</div>
                <div style="font-family:var(--mono);font-size:10px;color:var(--text3);">${dev.id}</div>
              </td>
              <td>${healthStatusBadge(health)}</td>
              <td>${componentDot(st.esp32)}</td>
              <td>${componentDot(st.dht11)}</td>
              <td>${componentDot(st.mq135)}</td>
              <td>${componentDot(st.gps)}</td>
              <td>${componentDot(st.sim900)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:4px;">
                  <div style="width:32px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
                    <div style="width:${dev.battery}%;height:100%;background:${dev.battery < 20 ? 'var(--red)' : dev.battery < 50 ? 'var(--yellow)' : 'var(--green)'};"></div>
                  </div>
                  <span style="font-size:11px;color:var(--text2);">${dev.battery}%</span>
                </div>
              </td>
              <td style="font-size:11px;color:var(--text2);">${lastSeen}</td>
              <td>
                <button class="btn btn-ghost btn-sm" onclick="editDevice('${dev.id}')" title="Edit">✎</button>
                ${health === 'needs_attention' || health === 'inactive' ? `<button class="btn btn-primary btn-sm" onclick="showMaintenanceModal('${dev.id}')" title="Log Maintenance">🔧</button>` : ''}
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (e) { console.error('Health table error:', e); }

  // Maintenance Log
  loadMaintenanceLogs();

  // Sensor Activity Log
  loadSensorLogs();

  updateAlertBadges();
  } catch (err) {
    console.error('❌ loadDashboard failed:', err);
    showConnError('Dashboard render error: ' + err.message);
  }
}

let selectedManagementDeviceId = null;
let managementMap = null;
let managementMapMarkers = {};

function getSelectedDeviceId() {
  return selectedManagementDeviceId || (devices[0]?.id || '');
}

function initManagementMap() {
  const container = document.getElementById('device-management-map');
  if (!container || managementMap) return;
  managementMap = L.map('device-management-map').setView([8.4542, 124.6319], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(managementMap);
  // Allow container to settle before measuring size
  setTimeout(() => { if (managementMap) managementMap.invalidateSize(); }, 150);
}

function updateManagementMapMarkers() {
  if (!managementMap) return;
  // Clear existing markers
  Object.values(managementMapMarkers).forEach(m => managementMap.removeLayer(m));
  managementMapMarkers = {};

  if (!devices || devices.length === 0) return;

  const bounds = [];
  devices.forEach(dev => {
    const lat = parseFloat(dev.lat);
    const lng = parseFloat(dev.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const health = getDeviceHealthStatus(dev, null);
      const color = health === 'active' ? '#22c55e' : health === 'inactive' ? '#ef4444' : health === 'needs_attention' ? '#f97316' : '#f59e0b';
      const marker = L.circleMarker([lat, lng], {
        radius: 10,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85
      }).addTo(managementMap);
      marker.bindPopup(`<b>${dev.name}</b><br>${dev.id}<br>${dev.location || ''}`);
      marker.on('click', () => selectManagementDevice(dev.id));
      managementMapMarkers[dev.id] = marker;
      bounds.push([lat, lng]);
    }
  });

  if (bounds.length > 0) {
    managementMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }
}

function selectManagementDevice(deviceId) {
  selectedManagementDeviceId = deviceId;
  const dev = devices.find(d => d.id === deviceId);
  if (!dev) return;

  // Pre-select device in inline maintenance form
  const maintSelect = document.getElementById('maint-device-id');
  if (maintSelect) maintSelect.value = deviceId;

  // Update map label
  const mapLabel = document.getElementById('map-device-label');
  if (mapLabel) mapLabel.textContent = `${dev.name} (${dev.id})`;

  // Pan map to device
  const marker = managementMapMarkers[deviceId];
  if (marker && managementMap) {
    managementMap.panTo(marker.getLatLng());
    marker.openPopup();
  }

  renderDeviceDetails(dev);
  renderDeviceMaintenanceHistory(dev.id);
  renderDeviceEvaluation(dev);
  showToast('info', dev.name, `${dev.location || dev.id} — loading live data…`, 3000);
}

async function renderDeviceDetails(dev) {
  const container = document.getElementById('device-detail-content');
  const title = document.getElementById('detail-device-name');
  const statusBadge = document.getElementById('detail-device-status-badge');
  const lastSeenEl = document.getElementById('detail-last-seen');

  if (title) title.textContent = `📟 ${dev.name}`;
  if (container) container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);">Loading live data...</div>`;

  // Fetch latest reading from Supabase
  const latest = await Database.getLatestDeviceLocation(dev.id);
  const health = getDeviceHealthStatus(dev, latest);
  const st = componentStatusFromLatestReading(dev, latest);
  const lastSeen = latest?.created_at ? formatTimeAgo(latest.created_at) : 'Never';

  if (statusBadge) statusBadge.innerHTML = healthStatusBadge(health);
  if (lastSeenEl) lastSeenEl.textContent = `Last seen: ${lastSeen}`;

  // Live sensor values
  const aqi   = latest?.aqi_value   ?? dev.aqi  ?? null;
  const temp  = latest?.temperature ?? dev.temp ?? null;
  const hum   = latest?.humidity    ?? dev.hum  ?? null;
  const co2   = latest?.co2_ppm     ? Math.round(latest.co2_ppm)
              : latest?.mq135_raw   ? Math.round(latest.mq135_raw * 0.12)
              : dev.co2 ?? null;
  const nh3   = latest?.nh3_ppm     != null ? Number(latest.nh3_ppm).toFixed(2) : '--';
  const benz  = latest?.benzene_ppm != null ? Number(latest.benzene_ppm).toFixed(3) : '--';
  const lat   = latest?.latitude    ?? dev.lat;
  const lng   = latest?.longitude   ?? dev.lng;

  if (!container) return;
  container.innerHTML = `
    <!-- Sensor readings row -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px;">
      <div style="background:${aqi !== null ? aqiColor(aqi) + '18' : 'rgba(255,255,255,0.03)'};border:1px solid ${aqi !== null ? aqiColor(aqi) + '40' : 'var(--border)'};border-radius:var(--radius);padding:12px 14px;">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">AQI</div>
        <div style="font-size:26px;font-weight:700;font-family:var(--mono);color:${aqi !== null ? aqiColor(aqi) : 'var(--text3)'};">${aqi ?? '--'}</div>
        <div style="font-size:11px;margin-top:3px;color:${aqi !== null ? aqiColor(aqi) : 'var(--text3)'};">${aqi !== null ? aqiLabel(aqi) : 'No data'}</div>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Temperature</div>
        <div style="font-size:26px;font-weight:700;font-family:var(--mono);color:var(--text);">${temp !== null ? temp : '--'}<span style="font-size:13px;font-weight:400;color:var(--text2);">°C</span></div>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Humidity</div>
        <div style="font-size:26px;font-weight:700;font-family:var(--mono);color:var(--text);">${hum !== null ? hum : '--'}<span style="font-size:13px;font-weight:400;color:var(--text2);">%</span></div>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">CO₂</div>
        <div style="font-size:26px;font-weight:700;font-family:var(--mono);color:var(--text);">${co2 !== null ? co2 : '--'}<span style="font-size:13px;font-weight:400;color:var(--text2);">ppm</span></div>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">NH₃</div>
        <div style="font-size:26px;font-weight:700;font-family:var(--mono);color:var(--text);">${nh3}<span style="font-size:13px;font-weight:400;color:var(--text2);">ppm</span></div>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Benzene</div>
        <div style="font-size:26px;font-weight:700;font-family:var(--mono);color:var(--text);">${benz}<span style="font-size:13px;font-weight:400;color:var(--text2);">ppm</span></div>
      </div>
    </div>

    <!-- Component status + device info row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;">
        <div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em;">Component Status</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          ${[
            { label: 'ESP32',  s: st.esp32  },
            { label: 'DHT11',  s: st.dht11  },
            { label: 'MQ135',  s: st.mq135  },
            { label: 'GPS',    s: st.gps    },
            { label: 'SIM900', s: st.sim900 }
          ].map(c => `
            <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:${c.s.color}12;border:1px solid ${c.s.color}30;border-radius:6px;">
              <span style="width:7px;height:7px;border-radius:50%;background:${c.s.color};flex-shrink:0;"></span>
              <span style="font-size:11px;color:var(--text2);">${c.label}</span>
              <span style="font-size:11px;font-weight:600;color:${c.s.color};margin-left:auto;">${c.s.label}</span>
            </div>
          `).join('')}
          <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:6px;">
            <span style="font-size:11px;color:var(--text2);">Battery</span>
            <span style="font-size:11px;font-weight:600;color:${dev.battery < 20 ? 'var(--red)' : dev.battery < 50 ? 'var(--yellow)' : 'var(--green)'};margin-left:auto;">${dev.battery}%</span>
          </div>
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;">
        <div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em;">Device Info</div>
        <div style="display:flex;flex-direction:column;gap:7px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <span style="color:var(--text3);">Device ID</span>
            <span style="font-family:var(--mono);color:var(--text);">${dev.id}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <span style="color:var(--text3);">Location</span>
            <span style="color:var(--text);text-align:right;max-width:160px;">${dev.location || 'Not set'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <span style="color:var(--text3);">Coordinates</span>
            <span style="font-family:var(--mono);font-size:11px;color:var(--text2);">${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <span style="color:var(--text3);">AQI Threshold</span>
            <span style="color:var(--text);">${dev.threshold || 100}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <span style="color:var(--text3);">Last Reading</span>
            <span style="color:var(--text2);">${latest?.created_at ? new Date(latest.created_at).toLocaleString() : 'Never'}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function renderDeviceMaintenanceHistory(deviceId) {
  const container = document.getElementById('device-maintenance-history');
  if (!container) return;
  container.innerHTML = '<p style="text-align:center;color:var(--text3);padding:20px;">Loading...</p>';

  const logs = await Database.fetchMaintenanceLogs(deviceId, 20);

  if (!logs || logs.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--text3);padding:20px;">No maintenance records for this device yet.</p>';
    return;
  }

  const typeLabel = {
    inspection: '🔍 Inspection',
    sensor_replacement: '🔧 Sensor Replacement',
    calibration: '⚖️ Calibration',
    cleaning: '🧹 Cleaning',
    firmware_update: '💾 Firmware Update',
    repair: '🛠️ Repair',
    other: '📝 Other'
  };
  const statusClr = { resolved: 'var(--green)', ongoing: 'var(--red)', monitoring: 'var(--yellow)' };

  container.innerHTML = logs.map(log => {
    const comps = Array.isArray(log.components) ? log.components.join(', ') : (log.components || 'General');
    return `
      <div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span style="font-size:12px;font-weight:600;color:var(--text);">${typeLabel[log.type] || log.type}</span>
          <span style="font-size:10px;color:${statusClr[log.status] || 'var(--text3)'};font-weight:500;">${(log.status || '').toUpperCase()}</span>
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:3px;">${comps}</div>
        ${log.notes ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;font-style:italic;">${log.notes}</div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:3px;">
          <span>${formatTimeAgo(log.created_at)}</span>
          <span>by ${log.performed_by || 'Manager'}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderDeviceEvaluation(dev) {
  const container = document.getElementById('device-evaluation-content');
  if (!container) return;
  const health = getDeviceHealthStatus(dev, null);
  const issues = [];
  if (health === 'inactive') issues.push('Device is not reporting data. Check power and network connectivity.');
  if ((dev.battery || 100) < 20) issues.push(`Low battery (${dev.battery}%). Schedule battery replacement or charging.`);
  if ((dev.aqi || 0) > (dev.threshold || 100)) issues.push(`AQI (${dev.aqi}) exceeds threshold (${dev.threshold}). Environmental risk detected.`);
  if (health === 'active' && issues.length === 0) issues.push('Device is operating normally. No issues detected.');

  container.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px;">Current Evaluation</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.6;">
        ${issues.map(i => `• ${i}`).join('<br>')}
      </div>
    </div>
    <div style="padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:var(--radius);margin-top:8px;">
      <div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:4px;">Recommended Actions</div>
      <div style="font-size:11px;color:var(--text3);line-height:1.5;">
        ${health === 'inactive' ? 'Inspect physical connections. Verify ESP32 is powered and WiFi credentials are correct. Check SIM900 signal strength.' : health === 'needs_attention' ? 'Review sensor readings. Consider recalibrating MQ135. Check DHT11 for dust buildup. Monitor GPS fix status.' : 'Continue routine monitoring. Log next scheduled maintenance.'}
      </div>
    </div>
  `;
}

async function loadAllDevices() {
  console.log('🔄 loadAllDevices() started');

  try {
    const dbDevices = await Database.getDevices();
    console.log('📊 loadAllDevices: dbDevices =', dbDevices);
    if (dbDevices && dbDevices.length > 0) {
      const defaultDevice = devices[0] || { aqi:0, co2:0, temp:0, hum:0, battery:100, lastSeen:'Just now', alerts:0 };
      devices = dbDevices.map((d, i) => ({
        id: d.device_id,
        name: d.name,
        location: d.location,
        lat: d.latitude || 8.4542,
        lng: d.longitude || 124.6319,
        status: d.status,
        aqi: i === 0 ? defaultDevice.aqi : 0,
        temp: i === 0 ? defaultDevice.temp : 0,
        hum: i === 0 ? defaultDevice.hum : 0,
        co2: i === 0 ? defaultDevice.co2 : 0,
        battery: i === 0 ? defaultDevice.battery : 100,
        lastSeen: i === 0 ? defaultDevice.lastSeen : 'Never',
        threshold: 100,
        alerts: 0
      }));
      console.log('✅ Devices loaded from DB:', devices.length);
    } else {
      console.warn('⚠️ DB returned 0 devices — using default');
    }
  } catch(e) {
    console.error('❌ loadAllDevices fetch error:', e);
  }

  if (!devices || devices.length === 0) {
    // Ensure we have at least a fallback so UI isn't completely empty
    devices = [{ id:'AW-001', name:'Air Quality Monitor', location:'Your Location', lat:8.4542, lng:124.6319, status:'online', aqi:0, co2:0, temp:0, hum:0, nh3:0, battery:100, lastSeen:'Just now', threshold:100, alerts:0 }];
    console.log('✅ Fallback device injected');
  }

  try {
    // Populate inline maintenance form device dropdown
    const maintSelect = document.getElementById('maint-device-id');
    if (maintSelect) {
      maintSelect.innerHTML = '<option value="">Select device...</option>' + devices.map(d => `<option value="${d.id}">${d.name} (${d.id})</option>`).join('');
    }

    // Initialize or update map
    initManagementMap();
    updateManagementMapMarkers();

    // Auto-select first device if none selected
    if ((!selectedManagementDeviceId || !devices.find(d => d.id === selectedManagementDeviceId)) && devices.length > 0) {
      selectManagementDevice(devices[0].id);
    } else if (selectedManagementDeviceId) {
      // Re-render details for currently selected device
      const dev = devices.find(d => d.id === selectedManagementDeviceId);
      if (dev) {
        renderDeviceDetails(dev);
        renderDeviceMaintenanceHistory(dev.id);
        renderDeviceEvaluation(dev);
      }
    }

    // Fix Leaflet size after container is visible
    setTimeout(() => { if (managementMap) managementMap.invalidateSize(); }, 200);
  } catch (renderErr) {
    console.error('❌ loadAllDevices render error:', renderErr);
    showConnError('Device page render failed: ' + renderErr.message);
  }
}



async function loadAlerts() {
  const dbActivity = await Database.fetchActivity(15);
  const alertsContainer = document.getElementById('alert-list');
  if (!alertsContainer) return;

  const lastRead = localStorage.getItem('alerts_last_read_mgmt');
  const allAlerts = (dbActivity || []).map(a => ({
    type: a.type,
    msg: a.message,
    time: formatTimeAgo(a.created_at),
    absTime: new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    isUnread: !lastRead || new Date(a.created_at) > new Date(lastRead),
    category: a.category
  }));

  alertsContainer.innerHTML = allAlerts.length > 0 ? allAlerts.map(alert => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border); ${alert.isUnread ? '' : 'opacity:0.6;'}">
      <div style="width:8px;height:8px;border-radius:50%;background:${ 
        alert.type === 'success' ? 'var(--green)' : 
        alert.type === 'warn' ? 'var(--yellow)' : 
        alert.type === 'danger' || alert.type === 'error' ? 'var(--red)' : 
        'var(--accent)' 
      }; ${alert.isUnread ? '' : 'filter: grayscale(1); opacity: 0.5;'}"></div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:${alert.isUnread ? '600' : '500'};">${alert.msg} ${alert.isUnread ? '<span style="color:var(--accent); font-size:14px; line-height:0; vertical-align:middle;">·</span>' : ''}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--text3);margin-top:2px;">
          <span>${alert.time} • ${alert.category || 'System'}</span>
          <span style="font-family:var(--mono);opacity:0.8;">${alert.absTime}</span>
        </div>
      </div>
    </div>
  `).join('') : '<p style="text-align:center;padding:20px;color:var(--text3);">No recent activity</p>';
  
  updateAlertBadges(allAlerts.filter(a => a.isUnread && (a.type === 'danger' || a.type === 'error' || a.type === 'warn')).length);
}

// ═══════════════════════════════════════════
// MAINTENANCE KPI REPORTS
// ═══════════════════════════════════════════
let reportRangeDays = 7;
let reportCharts = {};

function setReportRange(days, btn) {
  reportRangeDays = days;
  document.querySelectorAll('.report-range-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadReports();
}

async function loadReports() {
  // Fetch all logs (up to 500) then filter client-side by date range
  const allLogs = await Database.fetchMaintenanceLogs(null, 500);
  if (!allLogs) return;

  const now = new Date();
  const cutoff = reportRangeDays > 0
    ? new Date(now.getTime() - reportRangeDays * 24 * 60 * 60 * 1000)
    : null;

  const logs = cutoff
    ? allLogs.filter(l => new Date(l.created_at) >= cutoff)
    : allLogs;

  // Update range label
  const rangeLabel = document.getElementById('report-range-label');
  if (rangeLabel) {
    rangeLabel.textContent = cutoff
      ? `${cutoff.toLocaleDateString()} – ${now.toLocaleDateString()}`
      : `All time (${allLogs.length} records)`;
  }
  const genAt = document.getElementById('report-generated-at');
  if (genAt) genAt.textContent = `Generated ${now.toLocaleString()}`;

  // ── Compute KPIs ──────────────────────────────────────
  const total = logs.length;
  const resolved   = logs.filter(l => l.status === 'resolved').length;
  const ongoing    = logs.filter(l => l.status === 'ongoing').length;
  const monitoring = logs.filter(l => l.status === 'monitoring').length;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  // Average time between maintenance events (days)
  let avgInterval = '--';
  if (logs.length >= 2) {
    const sorted = [...logs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((new Date(sorted[i].created_at) - new Date(sorted[i-1].created_at)) / (1000 * 60 * 60 * 24));
    }
    avgInterval = (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1);
  }

  // Most common type
  const typeCounts = {};
  logs.forEach(l => { typeCounts[l.type] = (typeCounts[l.type] || 0) + 1; });
  const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

  // Most affected component
  const compCounts = {};
  logs.forEach(l => {
    const comps = Array.isArray(l.components) ? l.components : [];
    comps.forEach(c => { compCounts[c] = (compCounts[c] || 0) + 1; });
  });
  const topComp = Object.entries(compCounts).sort((a, b) => b[1] - a[1])[0];

  // ── KPI Cards ─────────────────────────────────────────
  const kpiEl = document.getElementById('report-kpi-cards');
  if (kpiEl) {
    kpiEl.innerHTML = [
      { label: 'Total Activities',    val: total,            sub: `in selected period`,                    color: 'var(--accent)',  icon: '🔧' },
      { label: 'Resolution Rate',     val: resolutionRate + '%', sub: `${resolved} resolved of ${total}`, color: resolutionRate >= 80 ? 'var(--green)' : resolutionRate >= 50 ? 'var(--yellow)' : 'var(--red)', icon: '✅' },
      { label: 'Ongoing Issues',      val: ongoing,          sub: `${monitoring} under monitoring`,        color: ongoing > 0 ? 'var(--orange)' : 'var(--green)', icon: '⚠️' },
      { label: 'Avg. Interval',       val: avgInterval,      sub: `days between activities`,               color: 'var(--teal)',    icon: '📅' },
      { label: 'Top Activity Type',   val: topType ? TYPE_LABELS[topType[0]] || topType[0] : '--', sub: topType ? `${topType[1]} occurrences` : 'No data', color: 'var(--purple)', icon: '📋' },
      { label: 'Most Affected Part',  val: topComp ? topComp[0] : '--', sub: topComp ? `${topComp[1]} times` : 'No data', color: 'var(--yellow)', icon: '🔩' },
    ].map(m => `
      <div class="metric-card" style="border-left:3px solid ${m.color};">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:15px;">${m.icon}</span>
          <div class="mc-label">${m.label}</div>
        </div>
        <div class="mc-value" style="color:${m.color};font-size:22px;">${m.val}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px;">${m.sub}</div>
      </div>
    `).join('');
  }

  // ── KPI Narrative Summary ─────────────────────────────
  const summaryEl = document.getElementById('report-kpi-summary');
  if (summaryEl) {
    const periodLabel = reportRangeDays > 0 ? `the last ${reportRangeDays} days` : 'all time';
    const healthColor = resolutionRate >= 80 ? 'var(--green)' : resolutionRate >= 50 ? 'var(--yellow)' : 'var(--red)';
    const healthWord  = resolutionRate >= 80 ? 'healthy' : resolutionRate >= 50 ? 'moderate' : 'poor';

    summaryEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Performance Overview</div>
          <p style="color:var(--text2);line-height:1.7;font-size:12px;">
            Over ${periodLabel}, <strong style="color:var(--text);">${total} maintenance ${total === 1 ? 'activity was' : 'activities were'}</strong> recorded across all devices.
            The overall resolution rate is <strong style="color:${healthColor};">${resolutionRate}%</strong> — indicating a
            <strong style="color:${healthColor};">${healthWord}</strong> maintenance posture.
            ${ongoing > 0 ? `<span style="color:var(--orange);"> ${ongoing} issue${ongoing > 1 ? 's remain' : ' remains'} unresolved and require attention.</span>` : ' All logged issues have been resolved or are under monitoring.'}
          </p>
          ${avgInterval !== '--' ? `
          <p style="color:var(--text2);line-height:1.7;font-size:12px;margin-top:8px;">
            Maintenance activities occur on average every <strong style="color:var(--teal);">${avgInterval} days</strong>.
            ${parseFloat(avgInterval) > 30 ? 'Consider increasing inspection frequency to improve device reliability.' : 'Inspection frequency is within a healthy range.'}
          </p>` : ''}
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Key Findings</div>
          <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;">
            ${topType ? `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.2);border-radius:8px;">
              <span>📋</span>
              <span style="color:var(--text2);">Most frequent activity: <strong style="color:var(--text);">${TYPE_LABELS[topType[0]] || topType[0]}</strong> (${topType[1]}×)</span>
            </div>` : ''}
            ${topComp ? `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;">
              <span>🔩</span>
              <span style="color:var(--text2);">Most serviced component: <strong style="color:var(--text);">${topComp[0]}</strong> (${topComp[1]}×)</span>
            </div>` : ''}
            <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:8px;">
              <span>✅</span>
              <span style="color:var(--text2);">Resolved: <strong style="color:var(--green);">${resolved}</strong> &nbsp;|&nbsp; Ongoing: <strong style="color:var(--orange);">${ongoing}</strong> &nbsp;|&nbsp; Monitoring: <strong style="color:var(--yellow);">${monitoring}</strong></span>
            </div>
            ${total === 0 ? `<div style="padding:7px 10px;color:var(--text3);font-style:italic;">No maintenance records found for this period.</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // ── Charts ────────────────────────────────────────────
  renderReportCharts(logs, typeCounts, compCounts);

  // ── Log Table ─────────────────────────────────────────
  const countEl = document.getElementById('report-log-count');
  if (countEl) countEl.textContent = `${logs.length} record${logs.length !== 1 ? 's' : ''}`;

  const tbody = document.querySelector('#report-log-table tbody');
  if (tbody) {
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3);">No maintenance records for this period.</td></tr>';
    } else {
      const STATUS_COLOR = { resolved: 'var(--green)', ongoing: 'var(--red)', monitoring: 'var(--yellow)' };
      tbody.innerHTML = logs.map(log => {
        const comps = Array.isArray(log.components) ? log.components.join(', ') : (log.components || '—');
        const dev = devices.find(d => d.id === log.device_id);
        return `
          <tr>
            <td style="font-family:var(--mono);font-size:11px;white-space:nowrap;">${new Date(log.created_at).toLocaleDateString()} <span style="color:var(--text3);">${new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></td>
            <td><span style="font-weight:600;font-size:12px;">${dev ? dev.name : log.device_id}</span><br><span style="font-family:var(--mono);font-size:10px;color:var(--text3);">${log.device_id}</span></td>
            <td>${TYPE_LABELS[log.type] || log.type}</td>
            <td style="font-size:11px;color:var(--text2);">${comps}</td>
            <td><span style="font-size:11px;font-weight:600;color:${STATUS_COLOR[log.status] || 'var(--text3)'};">${(log.status || '').toUpperCase()}</span></td>
            <td style="font-size:11px;color:var(--text2);">${log.performed_by || 'Manager'}</td>
            <td style="font-size:11px;color:var(--text3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${log.notes || ''}">${log.notes || '—'}</td>
          </tr>
        `;
      }).join('');
    }
  }
}

const TYPE_LABELS = {
  inspection:         '🔍 Inspection',
  sensor_replacement: '🔧 Sensor Replacement',
  calibration:        '⚖️ Calibration',
  cleaning:           '🧹 Cleaning',
  firmware_update:    '💾 Firmware Update',
  repair:             '🛠️ Repair',
  other:              '📝 Other'
};

function renderReportCharts(logs, typeCounts, compCounts) {
  const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#8fa3bc', font: { family: 'Sora', size: 11 }, boxWidth: 12, padding: 12 } }
    }
  };

  const PALETTE = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#14b8a6','#f97316'];

  // Helper: destroy old chart and create new one
  function makeChart(id, config) {
    if (reportCharts[id]) { reportCharts[id].destroy(); delete reportCharts[id]; }
    const canvas = document.getElementById(id);
    if (!canvas) return;
    reportCharts[id] = new Chart(canvas.getContext('2d'), config);
  }

  // ── Chart 1: Maintenance by Type (Doughnut) ───────────
  const typeLabels = Object.keys(typeCounts).map(k => TYPE_LABELS[k]?.replace(/^\S+\s/, '') || k);
  const typeData   = Object.values(typeCounts);
  makeChart('chart-type', {
    type: 'doughnut',
    data: {
      labels: typeLabels,
      datasets: [{ data: typeData, backgroundColor: PALETTE, borderColor: '#111827', borderWidth: 2, hoverOffset: 6 }]
    },
    options: {
      ...CHART_DEFAULTS,
      cutout: '60%',
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / (typeData.reduce((a,b)=>a+b,0)||1) * 100)}%)` } }
      }
    }
  });

  // ── Chart 2: Maintenance by Status (Bar) ─────────────
  makeChart('chart-status', {
    type: 'bar',
    data: {
      labels: ['Resolved', 'Ongoing', 'Monitoring'],
      datasets: [{
        label: 'Count',
        data: [
          logs.filter(l => l.status === 'resolved').length,
          logs.filter(l => l.status === 'ongoing').length,
          logs.filter(l => l.status === 'monitoring').length
        ],
        backgroundColor: ['rgba(34,197,94,.7)', 'rgba(239,68,68,.7)', 'rgba(245,158,11,.7)'],
        borderColor:     ['#22c55e', '#ef4444', '#f59e0b'],
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { ticks: { color: '#8fa3bc', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#8fa3bc', font: { size: 11 }, stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      },
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } }
    }
  });

  // ── Chart 3: Activity Over Time (Line) ────────────────
  // Group logs by date
  const dateCounts = {};
  logs.forEach(l => {
    const d = new Date(l.created_at).toLocaleDateString('en-CA'); // YYYY-MM-DD
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  });
  // Fill in missing dates in range
  const timeLabels = [];
  const timeData   = [];
  if (logs.length > 0) {
    const sorted = [...logs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const start = new Date(sorted[0].created_at);
    const end   = new Date();
    start.setHours(0,0,0,0);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toLocaleDateString('en-CA');
      timeLabels.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
      timeData.push(dateCounts[key] || 0);
    }
  }
  makeChart('chart-timeline', {
    type: 'line',
    data: {
      labels: timeLabels,
      datasets: [{
        label: 'Activities',
        data: timeData,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,.12)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#3b82f6',
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { ticks: { color: '#8fa3bc', font: { size: 10 }, maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#8fa3bc', font: { size: 11 }, stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      },
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } }
    }
  });

  // ── Chart 4: Component Frequency (Horizontal Bar) ─────
  const compSorted = Object.entries(compCounts).sort((a, b) => b[1] - a[1]);
  makeChart('chart-components', {
    type: 'bar',
    data: {
      labels: compSorted.map(([k]) => k),
      datasets: [{
        label: 'Times Serviced',
        data: compSorted.map(([, v]) => v),
        backgroundColor: compSorted.map((_, i) => PALETTE[i % PALETTE.length] + 'bb'),
        borderColor:     compSorted.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      scales: {
        x: { ticks: { color: '#8fa3bc', font: { size: 11 }, stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
        y: { ticks: { color: '#8fa3bc', font: { size: 11 } }, grid: { display: false } }
      },
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } }
    }
  });
}

function updateAlertBadges(count) {
  const dangerBadge = document.getElementById('danger-alert-badge');
  if (dangerBadge) {
    dangerBadge.textContent = count > 0 ? count : '';
    dangerBadge.style.display = count > 0 ? 'block' : 'none';
  }
}

function clearAlerts() {
  showConfirmModal('Clear Alerts', 'Are you sure you want to clear all alerts from the alert log?', async () => {
    alertLog = [];
    localStorage.removeItem('alerts_last_read_mgmt');
    await loadAlerts();
    updateAlertBadges(0);
  }, 'danger');
}


function showConfirmModal(title, message, onConfirm, type = 'danger') {
  let modal = document.getElementById('confirm-action-modal');
  if (!modal) {
    const modalHtml = `
      <div class="modal-bg" id="confirm-action-modal">
        <div class="modal" style="width:400px; text-align:center;">
          <div class="modal-head" style="justify-content:center; border-bottom:none; padding-bottom:0;">
            <div id="confirm-icon" style="font-size:48px; margin-bottom:10px;">⚠️</div>
          </div>
          <div class="modal-body" style="padding-top:0;">
            <h3 id="confirm-title" style="margin-bottom:12px; font-size:18px;">Confirm Action</h3>
            <p id="confirm-message" style="font-size:13px; color:var(--text2); line-height:1.5;">Are you sure?</p>
          </div>
          <div class="modal-foot" style="justify-content:center; border-top:none; padding-top:0; padding-bottom:24px;">
            <button class="btn btn-ghost" onclick="closeModal('confirm-action-modal')">Cancel</button>
            <button class="btn btn-primary" id="confirm-submit-btn">Confirm</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    modal = document.getElementById('confirm-action-modal');
  }
  
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  const submitBtn = document.getElementById('confirm-submit-btn');
  
  submitBtn.className = 'btn ' + (type === 'danger' ? 'btn-danger' : 'btn-primary');
  submitBtn.textContent = title.split(' ')[0] || 'Confirm';
  
  const icon = document.getElementById('confirm-icon');
  if (type === 'danger') icon.textContent = '⚠️';
  else if (type === 'success') icon.textContent = '✅';
  else icon.textContent = 'ℹ️';

  const newSubmitBtn = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
  
  newSubmitBtn.onclick = () => {
    closeModal('confirm-action-modal');
    onConfirm();
  };
  
  showModal('confirm-action-modal');
}

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');

  }
}



function updateModalMap(lat, lng) {
  // Map UI removed; keep only coordinate fields.
  document.getElementById('device-lat').value = lat.toFixed(6);
  document.getElementById('device-lng').value = lng.toFixed(6);
}


async function detectLocation() {
  const deviceId = document.getElementById('device-id')?.value.trim();
  if (!deviceId) {
    alert('Please enter a Device ID first (e.g., AW-001) to fetch its GPS location.');
    return;
  }

  const btn = document.querySelector('[onclick="detectLocation()"]');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⌛ Syncing with GPS...';
  btn.disabled = true;

  try {
    const latestReading = await Database.getLatestDeviceLocation(deviceId);
    
    if (latestReading && latestReading.latitude && latestReading.longitude) {
      const lat = parseFloat(latestReading.latitude);
      const lng = parseFloat(latestReading.longitude);
      
      updateModalMap(lat, lng);
      // We don't have toast in management, so just success notification
    } else {
      throw new Error(`No GPS data found for device <strong>${deviceId}</strong>. Ensure the hardware is online and has a GPS fix.`);
    }
  } catch (error) {
    console.error('GPS Sync Error:', error);
    const errorMsgEl = document.getElementById('sync-error-msg');
    if (errorMsgEl) errorMsgEl.innerHTML = error.message;
    showModal('sync-error-modal');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove('open');
}

function showAddDeviceModal() {
  document.getElementById('device-lat').value = '8.4542';
  document.getElementById('device-lng').value = '124.6319';
  showModal('device-modal');
}

function selectDevice(id) {
  document.querySelectorAll('.device-card').forEach(card => card.classList.toggle('selected', card.dataset.deviceId === id));
}

function editDevice(id) {
  const device = devices.find(d => d.id === id);
  if (!device) return;
  document.getElementById('device-name').value = device.name;
  document.getElementById('device-id').value = device.id;
  document.getElementById('device-location').value = device.location;
  document.getElementById('device-lat').value = device.lat;
  document.getElementById('device-lng').value = device.lng;
  document.getElementById('device-status').value = device.status;
  document.getElementById('device-threshold').value = device.threshold;
  showModal('device-modal');
}

async function deleteDevice(id) {
  showConfirmModal('Delete Device', `Are you sure you want to remove device ${id}? This will disconnect it from the management dashboard.`, async () => {
    try {
      const dbDevices = await Database.getDevices();
      const dbDev = dbDevices.find(d => d.device_id === id);
      if (dbDev) {
        await fetch(`${DB_CONFIG.url}/rest/v1/${DB_TABLES.devices}?id=eq.${dbDev.id}`, {
          method: 'DELETE',
          headers: { 'apikey': DB_CONFIG.anonKey, 'Authorization': `Bearer ${DB_CONFIG.anonKey}` }
        });
      }
      devices = devices.filter(d => d.id !== id);
      await Database.logActivity({ type: 'warn', message: `Device deleted: ${id}`, category: 'device', actor: 'Manager' });
      loadDashboard();
      loadAllDevices();
    } catch (e) { 
      console.error(e);
      alert('Error deleting device: ' + e.message);
    }
  });
}

async function saveDevice() {
  const name = document.getElementById('device-name').value.trim();
  const id = document.getElementById('device-id').value.trim();
  const location = document.getElementById('device-location').value.trim();
  const lat = parseFloat(document.getElementById('device-lat').value) || 8.4542;
  const lng = parseFloat(document.getElementById('device-lng').value) || 124.6319;
  const status = document.getElementById('device-status').value;
  
  if (!name || !id || !location) { alert('Please fill in all required fields'); return; }

  const action = devices.find(d => d.id === id) ? 'Update' : 'Register';
  showConfirmModal(`${action} Device`, `Are you sure you want to ${action.toLowerCase()} device ${id}?`, async () => {
    try {
      const deviceData = { device_id: id, name, location, latitude: lat, longitude: lng, status };
      const res = await fetch(`${DB_CONFIG.url}/rest/v1/${DB_TABLES.devices}?device_id=eq.${id}`, {
        method: 'PATCH',
        headers: { 
          'apikey': DB_CONFIG.anonKey, 
          'Authorization': `Bearer ${DB_CONFIG.anonKey}`, 
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal' 
        },
        body: JSON.stringify(deviceData)
      });

      if (res.ok) {
        const existingDev = devices.find(d => d.id === id);
        const isLocChange = existingDev && (Math.abs(existingDev.lat - lat) > 0.0001 || Math.abs(existingDev.lng - lng) > 0.0001);
        
        if (isLocChange) {
          await Database.logActivity({ type: 'warn', message: `Location change detected for ${id}: ${lat}, ${lng}`, category: 'location', actor: 'Manager' });
        } else {
          await Database.logActivity({ type: 'info', message: `Updated device settings for ${id}`, category: 'device', actor: 'Manager' });
        }
        closeModal('device-modal');
        await loadAllDevices();
        loadDashboard();
      }
    } catch (e) { 
      console.error(e); 
      alert('Error saving device: ' + e.message);
    }
  }, 'success');
}

function markAlertsAsRead() {
  localStorage.setItem('alerts_last_read_mgmt', new Date().toISOString());
  loadAlerts();
  showToast('info', 'Alerts Cleared', 'All notifications marked as read.');
}

// ── Maintenance helpers (localStorage removed — now Supabase-backed) ──────────

function showMaintenanceModal(preselectDeviceId = '') {
  const select = document.getElementById('maint-device-id');
  if (select) {
    select.innerHTML = '<option value="">Select device...</option>' + devices.map(d => `<option value="${d.id}" ${d.id === preselectDeviceId ? 'selected' : ''}>${d.name} (${d.id})</option>`).join('');
  }
  // If on devices section, scroll the inline form into view
  const form = document.getElementById('maint-device-id');
  if (form) form.focus();
}

async function saveMaintenanceLog() {
  const deviceId = document.getElementById('maint-device-id').value;
  const type = document.getElementById('maint-type').value;
  const components = Array.from(document.querySelectorAll('.maint-component:checked')).map(cb => cb.value);
  const notes = document.getElementById('maint-notes').value.trim();
  const status = document.getElementById('maint-status').value;

  if (!deviceId) { alert('Please select a device'); return; }

  const saveBtn = document.querySelector('[onclick="saveMaintenanceLog()"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

  try {
    // Save to Supabase maintenance_logs table
    await Database.saveMaintenanceLog({ deviceId, type, components, notes, status, actor: 'Manager' });

    // Also log to system_activity for the alert feed
    await Database.logActivity({
      type: 'info',
      message: `Maintenance [${type}] on ${deviceId}: ${status}. Components: ${components.join(', ') || 'none'}`,
      category: 'device',
      actor: 'Manager'
    }).catch(() => {});

    // Reset inline form
    document.getElementById('maint-device-id').value = '';
    document.getElementById('maint-type').value = 'inspection';
    document.querySelectorAll('.maint-component').forEach(cb => cb.checked = false);
    document.getElementById('maint-notes').value = '';
    document.getElementById('maint-status').value = 'resolved';

    // Refresh maintenance history if a device is selected
    if (selectedManagementDeviceId) {
      renderDeviceMaintenanceHistory(selectedManagementDeviceId);
    }
    loadMaintenanceLogs();

    if (saveBtn) { saveBtn.textContent = '✓ Saved'; setTimeout(() => { saveBtn.textContent = 'Save Log'; saveBtn.disabled = false; }, 1500); }
    showToast('success', 'Maintenance Logged', `Record saved for device ${deviceId}.`);
  } catch (e) {
    console.error('❌ saveMaintenanceLog error:', e);
    alert('Failed to save maintenance log: ' + e.message);
    if (saveBtn) { saveBtn.textContent = 'Save Log'; saveBtn.disabled = false; }
  }
}

async function loadMaintenanceLogs() {
  const container = document.getElementById('maintenance-log');
  if (!container) return;
  container.innerHTML = '<p style="text-align:center;padding:12px;color:var(--text3);">Loading...</p>';

  const logs = await Database.fetchMaintenanceLogs(null, 20);

  if (!logs || logs.length === 0) {
    container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text3);">No maintenance records yet</p>';
    return;
  }

  const typeLabel = {
    inspection: '🔍 Inspection',
    sensor_replacement: '🔧 Sensor Replacement',
    calibration: '⚖️ Calibration',
    cleaning: '🧹 Cleaning',
    firmware_update: '💾 Firmware Update',
    repair: '🛠️ Repair',
    other: '📝 Other'
  };
  const statusClr = { resolved: 'var(--green)', ongoing: 'var(--red)', monitoring: 'var(--yellow)' };

  container.innerHTML = logs.map(log => {
    const dev = devices.find(d => d.id === log.device_id) || { name: log.device_id };
    const comps = Array.isArray(log.components) ? log.components.join(', ') : (log.components || 'General');
    return `
      <div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span style="font-size:12px;font-weight:600;color:var(--text);">${typeLabel[log.type] || log.type}</span>
          <span style="font-size:10px;color:${statusClr[log.status] || 'var(--text3)'};font-weight:500;">${(log.status || '').toUpperCase()}</span>
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:3px;">
          <strong>${dev.name}</strong> • ${comps}
        </div>
        ${log.notes ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;font-style:italic;">${log.notes}</div>` : ''}
        <div style="font-size:10px;color:var(--text3);margin-top:3px;">${formatTimeAgo(log.created_at)}</div>
      </div>
    `;
  }).join('');
}

// ── Sensor Activity Log ────────────────────────────────
async function loadSensorLogs(showRefreshToast = false) {
  const container = document.getElementById('sensor-activity-log');
  if (!container) return;

  try {
    const activity = await Database.fetchActivity(20);
    const sensorEntries = (activity || []).filter(a =>
      ['hardware', 'environment', 'location', 'device'].includes(a.category) ||
      (a.message && (a.message.includes('sensor') || a.message.includes('GPS') || a.message.includes('SIM900') || a.message.includes('ESP32') || a.message.includes('DHT11') || a.message.includes('MQ135') || a.message.includes('inactive') || a.message.includes('offline') || a.message.includes('online')))
    );

    if (sensorEntries.length === 0) {
      container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text3);">No sensor activity logged yet</p>';
      return;
    }

    container.innerHTML = sensorEntries.map(a => {
      const color = a.type === 'danger' || a.type === 'error' ? 'var(--red)' : a.type === 'warn' ? 'var(--yellow)' : a.type === 'success' ? 'var(--green)' : 'var(--accent)';
      return `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
            <span style="font-size:12px;color:var(--text);font-weight:${a.type === 'danger' ? '600' : '500'};">${a.message}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:2px;">
            <span>${a.category || 'System'} • ${formatTimeAgo(a.created_at)}</span>
            <span style="font-family:var(--mono);">${new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      `;
    }).join('');
    if (showRefreshToast) showToast('info', 'Sensor Log Refreshed', `${sensorEntries.length} entr${sensorEntries.length === 1 ? 'y' : 'ies'} loaded.`, 3000);
  } catch (e) {
    container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text3);">Unable to load sensor activity</p>';
  }
}

function logout() {
  showConfirmModal('Logout', 'Are you sure you want to end your session?', () => {
    try {
      const user = JSON.parse(localStorage.getItem('breathsafe_user') || '{}');
      const name = user.name || 'Manager';
      // Log activity before clearing session
      Database.logActivity({
        type: 'info',
        message: `${name} logged out of Management Dashboard`,
        category: 'user',
        actor: name
      }).catch(() => {});
      localStorage.removeItem('breathsafe_user');
    } catch (e) {
      // ignore storage errors
    }
    window.location.href = '../../index.html';
  }, 'danger');
}

async function initializeManagement() {
  console.log('🚀 initializeManagement() starting. Hash:', window.location.hash);
  const section = window.location.hash.replace('#', '') || 'overview';
  console.log('📍 Target section:', section);

  // ── Welcome toast on login ──────────────────────────
  const pendingToast = sessionStorage.getItem('mgmt_toast');
  if (pendingToast) {
    sessionStorage.removeItem('mgmt_toast');
    try {
      const t = JSON.parse(pendingToast);
      // Slight delay so the page has rendered before the toast appears
      setTimeout(() => showToast(t.type, t.title, t.message, 5000), 600);
    } catch (_) {}
  }

  // Wait a tick for nav.js to render sidebar
  await new Promise(r => setTimeout(r, 50));

  const navItem = document.querySelector(`[onclick="showSection('${section}', this)"]`);
  console.log('🔍 navItem found:', !!navItem);
  if (navItem) {
    showSection(section, navItem);
  } else {
    const defaultNav = document.querySelector(`[onclick="showSection('overview', this)"]`);
    console.log('🔍 defaultNav found:', !!defaultNav);
    if (defaultNav) showSection('overview', defaultNav);
  }

  const INACTIVITY_MS = 90 * 1000; // align with admin logic (90s => 3 missed packets)
  let lastStatusByDevice = {}; // debounce per device activity logs

  async function evaluateDeviceInactivity() {
    if (!Array.isArray(devices) || devices.length === 0) return;

    // Fetch the latest reading per device (simple approach: 1-by-1).
    // This is acceptable for small device fleets; optimize later if needed.
    const updates = await Promise.all(devices.map(async (dev) => {
      try {
        const r = await Database.getLatestDeviceLocation(dev.id); // returns latest reading row
        return { dev, latest: r };
      } catch {
        return { dev, latest: null };
      }
    }));

    for (const { dev, latest } of updates) {
      const lastCreatedAt = latest?.created_at ? new Date(latest.created_at).getTime() : null;
      const isAlive = lastCreatedAt ? (Date.now() - lastCreatedAt) <= INACTIVITY_MS : false;

      // Component-ish fields for UI: only when alive; otherwise keep AQI/history stale.
      if (isAlive) {
        dev.aqi = latest?.aqi_value || dev.aqi || 0;
        dev.temp = latest?.temperature || dev.temp || 0;
        dev.hum = latest?.humidity || dev.hum || 0;
        dev.co2 = Math.round((latest?.mq135_raw || 0) * 0.12);
        dev.lastSeen = 'Just now';
        dev.status = dev.status === 'maintenance' ? 'maintenance' : 'online';
      } else {
        dev.status = dev.status === 'maintenance' ? 'maintenance' : 'offline';
        dev.lastSeen = 'Inactive';
        dev.alerts = 0;
      }

      const prev = lastStatusByDevice[dev.id];
      if (prev !== dev.status) {
        lastStatusByDevice[dev.id] = dev.status;

        // Show toast for status change
        if (prev !== undefined) {
          if (dev.status === 'offline') {
            showToast('danger', 'Device Offline', `${dev.name} (${dev.id}) stopped reporting data.`, 6000);
          } else if (dev.status === 'online') {
            showToast('success', 'Device Online', `${dev.name} (${dev.id}) is back online.`, 5000);
          }
        }

        // Persist status + log to system_activity (feeds management alert list)
        try {
          await Database.logActivity({
            type: dev.status === 'offline' ? 'danger' : 'success',
            message: dev.status === 'offline'
              ? `Device ${dev.id} inactive: no readings within ${(INACTIVITY_MS / 1000).toFixed(0)}s. Marked offline.`
              : `Device ${dev.id} activity restored. Marked online.`,
            category: 'hardware',
            actor: 'Manager',
            device_id: dev.id
          });
        } catch { /* ignore */ }

        // Update local DB device status for other pages
        try {
          if (dev.status !== 'maintenance') {
            await fetch(`${DB_CONFIG.url}/rest/v1/${DB_TABLES.devices}?device_id=eq.${dev.id}`, {
              method: 'PATCH',
              headers: {
                'apikey': DB_CONFIG.anonKey,
                'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({ status: dev.status })
            });
          }
        } catch { /* ignore */ }
      }

      // AQI threshold bookkeeping only for online devices
      if (dev.status === 'online' || dev.status === 'maintenance') {
        if ((dev.aqi || 0) > (dev.threshold || 0)) {
          dev.alerts = 1;
        } else {
          dev.alerts = 0;
        }
      }
    }
  }

  // Initial evaluation before first 30s tick
  evaluateDeviceInactivity();

  setInterval(async () => {
  try {
      await evaluateDeviceInactivity();
    } catch (e) {
      console.error('Inactivity evaluation failed:', e);
    }


    // Refresh active section UI
    const activeSection = document.querySelector('[id$="-section"]:not([style*="display: none"])');
    if (activeSection) {
      const sectionId = activeSection.id.replace('-section', '');
      if (sectionId === 'overview') loadDashboard();
      if (sectionId === 'devices') loadAllDevices();
      if (sectionId === 'alerts') loadAlerts();
      if (sectionId === 'reports') loadReports();
    }
  }, 30000);
}

document.addEventListener('DOMContentLoaded', initializeManagement);

