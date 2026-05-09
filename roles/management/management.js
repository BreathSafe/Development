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

const Database = {
  async fetchLatestReadings(limit = 10) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.readings}?order=created_at.desc&limit=${limit}`,
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
      console.error('Database fetch error:', error);
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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching devices:', error);
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
      return response.ok ? await response.json() : [];
    } catch (error) {
      console.error('Error fetching activity:', error);
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
let modalMap = null;
let modalMarker = null;

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

function statusColor(status) {
  return status === 'online' ? 'var(--green)' : status === 'offline' ? 'var(--red)' : 'var(--yellow)';
}

function showSection(section, element) {
  window.location.hash = section;
  document.querySelectorAll('[id$="-section"]').forEach(s => s.style.display = 'none');
  document.getElementById(`${section}-section`).style.display = 'block';
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  element.classList.add('active');
  if (section === 'dashboard') loadDashboard();
  if (section === 'devices') loadAllDevices();
  if (section === 'map') loadFullMap();
  if (section === 'analytics') loadAnalytics();
  if (section === 'alerts') loadAlerts();
}

async function loadDashboard() {
  const readings = await Database.fetchLatestReadings(10);
  
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
  }

  const onlineDevices = devices.filter(d => d.status === 'online');
  const avgAQI = onlineDevices.length > 0 ? Math.round(onlineDevices.reduce((s,d) => s + d.aqi, 0) / onlineDevices.length) : 0;
  document.getElementById('mgmt-metrics').innerHTML = [
    { label:'Total Devices', val: devices.length, unit:'', color:'var(--accent)' },
    { label:'Online Devices', val: onlineDevices.length, unit:`/ ${devices.length}`, color:'var(--green)' },
    { label:'Avg AQI', val: avgAQI, unit:'', color:aqiColor(avgAQI) },
    { label:'Active Alerts', val: devices.reduce((s,d) => s + d.alerts, 0), unit:'', color:'var(--red)' },
    { label:'Avg Battery', val: onlineDevices.length > 0 ? Math.round(onlineDevices.reduce((s,d) => s + d.battery, 0) / onlineDevices.length) : 0, unit:'%', color:'var(--teal)' },
    { label:'Data Points', val: readings ? readings.length : 0, unit:'', color:'var(--orange)' }
  ].map(m => `
    <div class="metric-card">
      <div class="mc-label">${m.label}</div>
      <div class="mc-value">${m.val}<span class="mc-unit">${m.unit}</span></div>
    </div>
  `).join('');
  loadDeviceGrid();
  loadDeviceList();
  loadDeviceMap();
  updateAlertBadges();
}

function loadDeviceGrid() {
  document.getElementById('device-grid').innerHTML = devices.map(device => `
    <div class="device-card" data-device-id="${device.id}" onclick="selectDevice('${device.id}')">
      <div class="dc-top">
        <div>
          <div style="font-weight:600;font-size:13px;">${device.name}</div>
          <div class="dc-id">${device.id}</div>
        </div>
        <span class="status-badge status-${device.status}">${device.status}</span>
      </div>
      <div class="dc-metrics">
        <div class="dc-m">
          <div class="dc-m-label">AQI</div>
          <div class="dc-m-val">${device.aqi}<span class="aqi-pill ${aqiClass(device.aqi)}">${aqiLabel(device.aqi)}</span></div>
        </div>
        <div class="dc-m">
          <div class="dc-m-label">Temp</div>
          <div class="dc-m-val">${device.temp}<span>°C</span></div>
        </div>
        <div class="dc-m">
          <div class="dc-m-label">Humidity</div>
          <div class="dc-m-val">${device.hum}<span>%</span></div>
        </div>
        <div class="dc-m">
          <div class="dc-m-label">Battery</div>
          <div class="dc-m-val">${device.battery}<span>%</span></div>
        </div>
      </div>
    </div>
  `).join('');
}

function loadDeviceList() {
  const table = document.getElementById('device-table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Device ID</th>
        <th>Name</th>
        <th>Location</th>
        <th>Status</th>
        <th>AQI</th>
        <th>Battery</th>
        <th>Last Seen</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${devices.map(device => `
        <tr>
          <td style="font-family:var(--mono);">${device.id}</td>
          <td>${device.name}</td>
          <td>${device.location}</td>
          <td><span class="status-badge status-${device.status}">${device.status}</span></td>
          <td><span class="aqi-pill ${aqiClass(device.aqi)}">${device.aqi}</span></td>
          <td>${device.battery}%</td>
          <td>${device.lastSeen}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="editDevice('${device.id}')">Edit</button></td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

function loadDeviceMap() {
  const mapContainer = 'map';
  if (!maps[mapContainer]) {
    maps[mapContainer] = L.map(mapContainer, { zoomControl: true }).setView([8.4542, 124.6319], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    }).addTo(maps[mapContainer]);
  }
  const map = maps[mapContainer];
  if (markers[mapContainer]) markers[mapContainer].forEach(mk => mk.remove());
  markers[mapContainer] = [];
  devices.forEach(device => {
    if (device.status === 'offline' && device.aqi === 0) {
      const marker = L.circleMarker([device.lat, device.lng], {
        radius: 9, color: '#ef4444', fillColor: '#ef4444', fillOpacity: .4, weight: 2
      }).addTo(map);
      markers[mapContainer].push(marker);
      return;
    }
    const color = device.status === 'maintenance' ? '#f59e0b' : aqiColor(device.aqi);
    const marker = L.circleMarker([device.lat, device.lng], {
      radius: 12, color, fillColor: color, fillOpacity: .75, weight: 2
    }).addTo(map);
    marker.bindPopup(`
      <div style="min-width:180px;font-family:'Sora',sans-serif;">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${device.name}</div>
        <div style="font-size:11px;color:#8fa3bc;margin-bottom:8px;">${device.location} · <b>${device.id}</b></div>
        ${device.status !== 'offline' && device.status !== 'maintenance' ? `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="font-size:28px;font-weight:700;color:${color};font-family:'DM Mono',monospace;">${device.aqi}</div>
          <div>
            <div style="font-size:11px;font-weight:600;color:${color}">${aqiLabel(device.aqi)}</div>
            <div style="font-size:10px;color:#8fa3bc;">AQI Index</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">
          <div>🌡 ${device.temp}°C</div><div>💧 ${device.hum}%</div>
          <div>☁ CO₂ ${device.co2}ppm</div><div>🔋 ${device.battery}%</div>
        </div>` : `
        <div style="color:${statusColor(device.status)};font-size:12px;font-weight:600;text-transform:capitalize;">⚠ ${device.status}</div>
        <div style="font-size:11px;color:#8fa3bc;">Last seen: ${device.lastSeen}</div>
        `}
      </div>
    `);
    markers[mapContainer].push(marker);
  });
}

function switchDeviceView(view, element) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  element.classList.add('active');
  document.getElementById('device-grid-view').style.display = view === 'grid' ? 'block' : 'none';
  document.getElementById('device-list-view').style.display = view === 'list' ? 'block' : 'none';
  document.getElementById('device-map-view').style.display = view === 'map' ? 'block' : 'none';
  if (view === 'map') setTimeout(() => maps['map']?.invalidateSize(), 100);
}

async function loadAllDevices() {
  const table = document.getElementById('all-devices-table');
  table.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;">Loading...</td></tr>';
  
  try {
    const dbDevices = await Database.getDevices();
    if (dbDevices && dbDevices.length > 0) {
      const defaultDevice = devices[0] || { aqi:0, co2:0, temp:0, hum:0, battery:100, lastSeen:'Just now', alerts:0 };
      devices = dbDevices.map((d, i) => ({
        id: d.device_id,
        name: d.name,
        location: d.location,
        lat: d.latitude,
        lng: d.longitude,
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
    }
  } catch(e) {
    console.error(e);
  }

  table.innerHTML = `
    <thead>
      <tr>
        <th>Device ID</th>
        <th>Name</th>
        <th>Location</th>
        <th>Status</th>
        <th>AQI</th>
        <th>Temperature</th>
        <th>Humidity</th>
        <th>Battery</th>
        <th>Threshold</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${devices.map(device => `
        <tr>
          <td style="font-family:var(--mono);">${device.id}</td>
          <td>${device.name}</td>
          <td>${device.location}</td>
          <td><span class="status-badge status-${device.status}">${device.status}</span></td>
          <td><span class="aqi-pill ${aqiClass(device.aqi)}">${device.aqi}</span></td>
          <td>${device.temp}°C</td>
          <td>${device.hum}%</td>
          <td>${device.battery}%</td>
          <td>${device.threshold}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="editDevice('${device.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteDevice('${device.id}')">Delete</button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

function loadFullMap() {
  const mapContainer = 'map-full';
  if (!maps[mapContainer]) {
    maps[mapContainer] = L.map(mapContainer, { zoomControl: true }).setView([8.4542, 124.6319], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    }).addTo(maps[mapContainer]);
  }
  const tempMap = maps['map'];
  maps['map'] = maps[mapContainer];
  loadDeviceMap();
  maps['map'] = tempMap;
  setTimeout(() => maps[mapContainer]?.invalidateSize(), 100);
}

async function loadAnalytics() {
  const stats = await Database.fetchHourlyStats(24);
  document.getElementById('stats-summary').innerHTML = stats && stats.length > 0 ? `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
      <div><strong>Avg AQI (24h):</strong> ${Math.round(stats.reduce((s, stat) => s + (stat.avg_aqi || 0), 0) / stats.length)}</div>
      <div><strong>Max AQI:</strong> ${Math.max(...stats.map(s => s.max_aqi || 0))}</div>
      <div><strong>Avg Temperature:</strong> ${Math.round(stats.reduce((s, stat) => s + (stat.avg_temp || 0), 0) / stats.length)}°C</div>
      <div><strong>Avg Humidity:</strong> ${Math.round(stats.reduce((s, stat) => s + (stat.avg_humidity || 0), 0) / stats.length)}%</div>
      <div><strong>Total Readings:</strong> ${stats.reduce((s, stat) => s + (stat.reading_count || 0), 0)}</div>
    </div>
  ` : '<p>No statistical data available</p>';
  setTimeout(() => {
    const aqiCtx = document.getElementById('aqi-chart');
    const tempHumCtx = document.getElementById('temp-hum-chart');
    if (!aqiCtx || !tempHumCtx || !window.Chart) return;
    const chartLabels = stats ? stats.slice(0, 8).reverse().map(s => new Date(s.hour).toLocaleTimeString()) : [];
    const avgAqiData = stats ? stats.slice(0, 8).reverse().map(s => s.avg_aqi || 0) : [];
    const tempData = stats ? stats.slice(0, 8).reverse().map(s => s.avg_temp || 0) : [];
    const humData = stats ? stats.slice(0, 8).reverse().map(s => s.avg_humidity || 0) : [];
    new Chart(aqiCtx, {
      type: 'line',
      data: { labels: chartLabels, datasets: [{ label: 'AQI', data: avgAqiData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
    new Chart(tempHumCtx, {
      type: 'line',
      data: { labels: chartLabels, datasets: [
        { label: 'Temperature', data: tempData, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', fill: true, tension: 0.4 },
        { label: 'Humidity', data: humData, borderColor: '#14b8a6', backgroundColor: 'rgba(20,184,166,0.1)', fill: true, tension: 0.4 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });
  }, 100);
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

function updateAlertBadges(count) {
  const badge = document.getElementById('alert-badge');
  if (badge) {
    badge.textContent = count > 0 ? count : '';
    badge.style.display = count > 0 ? 'block' : 'none';
  }
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
    if (modalId === 'device-modal') {
      setTimeout(initModalMap, 200);
    }
  }
}

function initModalMap() {
  const mapContainer = document.getElementById('modal-map');
  if (!mapContainer) return;

  const lat = parseFloat(document.getElementById('device-lat').value) || 8.4542;
  const lng = parseFloat(document.getElementById('device-lng').value) || 124.6319;

  if (!modalMap) {
    modalMap = L.map('modal-map').setView([lat, lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(modalMap);

    modalMap.on('click', (e) => {
      const { lat, lng } = e.latlng;
      updateModalMap(lat, lng);
    });
  } else {
    modalMap.setView([lat, lng], 13);
    modalMap.invalidateSize();
  }

  updateModalMap(lat, lng);
}

function updateModalMap(lat, lng) {
  document.getElementById('device-lat').value = lat.toFixed(6);
  document.getElementById('device-lng').value = lng.toFixed(6);

  if (!modalMarker) {
    modalMarker = L.marker([lat, lng], { draggable: true }).addTo(modalMap);
    modalMarker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      updateModalMap(pos.lat, pos.lng);
    });
  } else {
    modalMarker.setLatLng([lat, lng]);
  }
  
  if (modalMap) modalMap.panTo([lat, lng]);
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
  showConfirmModal('Mark as Read', 'Clear all unread notification badges?', () => {
    localStorage.setItem('alerts_last_read_mgmt', new Date().toISOString());
    loadAlerts();
    updateAlertBadges(0);
  }, 'info');
}

function logout() {
  showConfirmModal('Logout', 'Are you sure you want to end your session?', () => {
    window.location.href = '../../index.html';
  }, 'info');
}

async function initializeManagement() {
  const section = window.location.hash.replace('#', '') || 'dashboard';
  const navItem = document.querySelector(`[onclick="showSection('${section}', this)"]`);
  if (navItem) {
    showSection(section, navItem);
  } else {
    const defaultNav = document.querySelector(`[onclick="showSection('dashboard', this)"]`);
    if (defaultNav) showSection('dashboard', defaultNav);
  }

  setInterval(async () => {
    const readings = await Database.fetchLatestReadings(1);
    if (readings && readings.length > 0) {
      const latest = readings[0];
      devices[0] = {
        ...devices[0],
        aqi: latest.aqi_value || 0,
        temp: latest.temperature || 0,
        hum: latest.humidity || 0,
        co2: Math.round((latest.mq135_raw || 0) * 0.12),
        lastSeen: 'Just now'
      };
      if (devices[0].aqi > devices[0].threshold) {
        devices[0].alerts = 1;
        if (!alertLog.some(a => a.msg.includes(`AQI ${devices[0].aqi}`))) {
          alertLog.unshift({ type:'warn', msg:`Device ${devices[0].id}: AQI ${devices[0].aqi} exceeds threshold`, time:'Just now' });
        }
      } else {
        devices[0].alerts = 0;
      }
      const activeSection = document.querySelector('[id$="-section"]:not([style*="display: none"])');
      if (activeSection) {
        const sectionId = activeSection.id.replace('-section', '');
        if (sectionId === 'dashboard') loadDashboard();
        if (sectionId === 'devices') loadAllDevices();
        if (sectionId === 'alerts') loadAlerts();
      }
    }
  }, 30000);
}

document.addEventListener('DOMContentLoaded', initializeManagement);
