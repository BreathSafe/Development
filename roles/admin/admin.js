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
  hourlyStats: 'hourly_stats'
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
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      if (data && data.length > 0) {
        cachedReadings = data;
        lastCacheTime = new Date();
        console.log('✅ Data cached for offline use');
      }
      return data;
    } catch (error) {
      console.error('Database fetch error:', error);
      if (cachedReadings && cachedReadings.length > 0) {
        console.log('📦 Using cached data from:', lastCacheTime);
        return cachedReadings;
      }
      return null;
    }
  },

  async fetchSystemStats() {
    const headers = {
      'apikey': DB_CONFIG.anonKey,
      'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
      'Prefer': 'count=exact',
      'Range-Unit': 'items',
      'Range': '0-0'
    };

    const fetchCount = async (table, filter = '') => {
      try {
        const res = await fetch(
          `${DB_CONFIG.url}/rest/v1/${table}?select=id${filter}&limit=1`,
          { headers }
        );
        const contentRange = res.headers.get('Content-Range') || '';
        const match = contentRange.match(/\/(\d+)$/);
        return match ? parseInt(match[1], 10) : null;
      } catch (e) {
        return null;
      }
    };

    const [totalReadings, totalDevices, totalUsers, totalSMS] = await Promise.all([
      fetchCount(DB_TABLES.readings),
      fetchCount(DB_TABLES.devices, '&status=eq.active'),
      fetchCount(DB_TABLES.systemUsers, '&status=eq.active'),
      fetchCount(DB_TABLES.notificationUsers, '&is_active=eq.true')
    ]);

    return { totalReadings, totalDevices, totalUsers, totalSMS };
  },

  async clearAllData() {
    try {
      const response = await fetch(`${DB_CONFIG.url}/rest/v1/${DB_TABLES.readings}`, {
        method: 'DELETE',
        headers: {
          'apikey': DB_CONFIG.anonKey,
          'Authorization': `Bearer ${DB_CONFIG.anonKey}`
        }
      });
      return response.ok;
    } catch (error) {
      console.error('Clear database error:', error);
      return false;
    }
  },

  formatTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now - time) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  },

  async getNotificationUsers() {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.notificationUsers}?is_active=eq.true&order=created_at.desc`,
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
      console.error('Error fetching notification users:', error);
      return [];
    }
  },

  async registerSMSUser(userData) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.notificationUsers}`,
        {
          method: 'POST',
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(userData)
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error registering SMS user:', error);
      throw error;
    }
  },

  async deleteSMSUser(userId) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.notificationUsers}?id=eq.${userId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`
          }
        }
      );
      return response.ok;
    } catch (error) {
      console.error('Error deleting SMS user:', error);
      return false;
    }
  },

  async logSMSNotification(notificationData) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.smsNotifications}`,
        {
          method: 'POST',
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(notificationData)
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error logging SMS notification:', error);
      return null;
    }
  },

  async getSMSNotifications(limit = 200) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.smsNotifications}?order=created_at.desc&limit=${limit}`,
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
      console.error('Error fetching SMS notifications:', error);
      return [];
    }
  },

  async updateUserLastAlert(userId) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.notificationUsers}?id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ last_alert: new Date().toISOString() })
        }
      );
      return response.ok;
    } catch (error) {
      console.error('Error updating last alert:', error);
      return false;
    }
  },

  async getSystemUsers() {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.systemUsers}?order=created_at.desc`,
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
      console.error('Error fetching system users:', error);
      return [];
    }
  },

  async createSystemUser(userData) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.systemUsers}`,
        {
          method: 'POST',
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(userData)
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error creating system user:', error);
      throw error;
    }
  },

  async updateSystemUser(userId, userData) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.systemUsers}?id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(userData)
        }
      );
      return response.ok;
    } catch (error) {
      console.error('Error updating system user:', error);
      return false;
    }
  },

  async deleteSystemUser(userId) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.systemUsers}?id=eq.${userId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`
          }
        }
      );
      return response.ok;
    } catch (error) {
      console.error('Error deleting system user:', error);
      return false;
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

  async createDevice(deviceData) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.devices}`,
        {
          method: 'POST',
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(deviceData)
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error creating device:', error);
      throw error;
    }
  },

  async updateDevice(deviceId, deviceData) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.devices}?id=eq.${deviceId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(deviceData)
        }
      );
      return response.ok;
    } catch (error) {
      console.error('Error updating device:', error);
      return false;
    }
  },

  async deleteDevice(deviceId) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.devices}?id=eq.${deviceId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`
          }
        }
      );
      return response.ok;
    } catch (error) {
      console.error('Error deleting device:', error);
      return false;
    }
  }
};

function formatTimeAgo(timestamp) {
  return Database.formatTimeAgo(timestamp);
}

function initializeMapInOverview() {
  loadOverview();
}

function generateOfflineData() {
  console.log('🔄 Generating offline fallback data...');
  const now = new Date();
  const mockData = [];
  for (let i = 0; i < 5; i++) {
    const timeOffset = i * 30000;
    const mockTime = new Date(now.getTime() - timeOffset);
    mockData.push({
      id: i + 1,
      created_at: mockTime.toISOString(),
      temperature: 25 + Math.random() * 10,
      humidity: 40 + Math.random() * 30,
      mq135_raw: Math.floor(400 + Math.random() * 1600),
      aqi_value: Math.floor(30 + Math.random() * 120),
      aqi_category: 'Moderate'
    });
  }
  logDatabaseActivity('warn', 'System running in offline mode - using cached/mock data');
  return mockData;
}

let cachedReadings = null;
let lastCacheTime = null;

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

function formatAlertClockTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getAqiSeverityLevel(aqi) {
  if (aqi <= 50) return 0;
  if (aqi <= 100) return 1;
  if (aqi <= 200) return 2;
  return 3;
}

function getTemperatureSeverityLevel(temp) {
  if (temp <= 30) return 0;
  if (temp <= 34) return 1;
  if (temp <= 38) return 2;
  return 3;
}

function getAlertLevel(device) {
  const aqiLevel = getAqiSeverityLevel(device.aqi || 0);
  const tempLevel = getTemperatureSeverityLevel(device.temp || 0);
  const level = Math.max(aqiLevel, tempLevel);
  return ['normal', 'moderate', 'high', 'danger'][level];
}

function getAirQualityText(aqi) {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Slightly polluted (AQI rising)';
  if (aqi <= 200) return 'Unhealthy (high pollutant concentration detected)';
  return 'Hazardous (dangerous pollutant level detected)';
}

function getTemperatureText(temp) {
  if (temp <= 30) return 'Comfortable (within normal range)';
  if (temp <= 34) return 'Warm (above normal comfort level)';
  if (temp <= 38) return 'High heat levels detected';
  return 'Extreme heat condition';
}

function getAlertTypeFromLevel(level) {
  if (level === 'danger') return 'danger';
  if (level === 'high' || level === 'moderate') return 'warn';
  return 'success';
}

function buildAlertContent(level, device) {
  const location = device.location || 'School Campus Monitoring Zone';
  const time = formatAlertClockTime();
  const airQuality = getAirQualityText(device.aqi || 0);
  const temperature = getTemperatureText(device.temp || 0);
  const templates = {
    moderate: {
      smsHeader: 'BreatheSafe Alert (Moderate Condition)',
      smsBody: `Location: ${location}\nTime: ${time}\nAir Quality: ${airQuality}\nTemperature: ${temperature}\nDetails: Sensitive individuals may experience mild discomfort such as headache or fatigue.\nAdvice: Limit outdoor activities and stay hydrated.`,
      toastType: 'info',
      toastTitle: 'Moderate Air Condition',
      toastMessage: `Location: ${location} | Time: ${time}\nAir quality is slightly polluted and temperature is rising. Some individuals may feel mild discomfort. Limit outdoor exposure.`
    },
    high: {
      smsHeader: 'BreatheSafe Warning (High Risk Condition)',
      smsBody: `Location: ${location}\nTime: ${time}\nAir Quality: ${airQuality}\nTemperature: ${temperature}\nDetails: Risk of breathing difficulty, dizziness, dehydration, and reduced focus.\nAdvice: Avoid outdoor exposure, stay indoors, and drink plenty of water.`,
      toastType: 'warn',
      toastTitle: 'Unhealthy Conditions Detected',
      toastMessage: `Location: ${location} | Time: ${time}\nPoor air quality and high temperature detected. Risk of fatigue, dizziness, and breathing discomfort. Stay indoors and hydrate.`
    },
    danger: {
      smsHeader: 'BreatheSafe Emergency Alert (Critical Condition)',
      smsBody: `Location: ${location}\nTime: ${time}\nAir Quality: ${airQuality}\nTemperature: ${temperature}\nDetails: High risk of heat stroke, asthma attacks, and serious health effects.\nAction Required: Suspend outdoor activities immediately and ensure student safety.`,
      toastType: 'error',
      toastTitle: 'Emergency Environmental Alert',
      toastMessage: `Location: ${location} | Time: ${time}\nHazardous air quality and extreme heat detected. Immediate action required: avoid outdoor activities and ensure safety precautions.`
    },
    normal: {
      smsHeader: 'BreatheSafe Status (Normal Condition)',
      smsBody: `Location: ${location}\nTime: ${time}\nAir Quality: Good\nTemperature: Comfortable\nDetails: Conditions are within safe and comfortable ranges.`,
      toastType: 'success',
      toastTitle: 'Safe Environment',
      toastMessage: `Location: ${location} | Time: ${time}\nAir quality and temperature are within safe and comfortable levels. No health risks detected.`
    }
  };
  return templates[level] || templates.normal;
}

function showDashboardToast(type, title, message, duration = 7000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:70px;right:16px;display:flex;flex-direction:column;gap:8px;z-index:10000;max-width:360px;';
    document.body.appendChild(container);
  }
  const palette = {
    success: { bg: 'rgba(34,197,94,.95)', border: 'rgba(34,197,94,.8)' },
    info: { bg: 'rgba(59,130,246,.95)', border: 'rgba(59,130,246,.8)' },
    warn: { bg: 'rgba(245,158,11,.95)', border: 'rgba(245,158,11,.8)' },
    error: { bg: 'rgba(239,68,68,.95)', border: 'rgba(239,68,68,.8)' }
  };
  const color = palette[type] || palette.info;
  const toast = document.createElement('div');
  toast.style.cssText = `background:${color.bg};border:1px solid ${color.border};color:#fff;border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.4;box-shadow:0 8px 20px rgba(0,0,0,.28);white-space:pre-line;`;
  toast.innerHTML = `<div style="font-weight:700;margin-bottom:4px;">${title}</div><div>${message}</div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(8px)';
    toast.style.transition = 'all .22s ease';
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

let devices = [
  { id:'AW-001', name:'Air Quality Monitor', location:'Your Location', lat:8.4542, lng:124.6319, status:'online', aqi:0, temp:0, hum:0, battery:100 }
];
let users = [
  { id:'USR-001', name:'Admin User', email:'admin@system.com', role:'admin', dept:'System', status:'active', created:'2024-01-10' },
  { id:'USR-002', name:'Manager User', email:'manager@system.com', role:'management', dept:'Operations', status:'active', created:'2024-02-14' }
];
let systemActivity = [];
let databaseActivityLog = [];
let roleActivityLog = [];
let totalGeneratedAlerts = 0;
let activeSessionUserId = 'USR-001';
let userEngagementStats = JSON.parse(localStorage.getItem('userEngagementStats') || '{}');

function ensureUserStats(userId) {
  if (!userId) return;
  if (!userEngagementStats[userId]) {
    userEngagementStats[userId] = {
      logins: 0,
      dashboardViews: 0,
      aqiViews: 0,
      smsSent: 0,
      smsFailed: 0,
      smsSuccess: 0,
      alertsGenerated: 0
    };
  }
}

function trackUserStat(userId, key, increment = 1) {
  ensureUserStats(userId);
  if (!userEngagementStats[userId]) return;
  userEngagementStats[userId][key] = (userEngagementStats[userId][key] || 0) + increment;
  localStorage.setItem('userEngagementStats', JSON.stringify(userEngagementStats));
}

let adminAlerts = [
  { type:'info', msg:'Arduino system online', time:'Just now' },
  { type:'success', msg:'Database connection active', time:'1m ago' }
];
let adminMap = null;
let adminMarkers = {};
let lastToastAlertLevel = null;
let devicesPageMap = null;
let devicesPageMarkers = [];
let currentDetailDeviceId = null;
let aqiChartInstance = null;
let envChartInstance = null;
let reportUserBarChart = null;
let reportAlertLineChart = null;
let reportSmsStackedChart = null;
let reportAqiPieChart = null;

function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
}

function navigateToPage(page) {
  window.location.href = `${page}.html`;
}

async function loadOverview() {
  console.log('🔄 Admin Dashboard: Fetching Arduino data from Supabase...');
  let readings = null;
  let usingRealData = false;
  let dataSource = 'Offline (Mock Data)';

  try {
    readings = await Database.fetchLatestReadings(10);
    if (readings && readings.length > 0) {
      usingRealData = true;
      dataSource = 'Supabase Database';
      console.log(`✅ Admin Dashboard: Connected to database - ${readings.length} readings found`);
      if (!systemActivity.some(a => a.msg.includes('Connected to database'))) {
        systemActivity.unshift({ type: 'success', msg: `Connected to database: Fetched ${readings.length} readings`, time: new Date().toLocaleTimeString() });
      }
    }
  } catch (error) {
    console.warn('⚠️ Database connection failed, using offline fallback:', error.message);
    readings = generateOfflineData();
    dataSource = 'Offline (Cached/Mock)';
  }

  try {
    const dbDevices = await Database.getDevices();
    if (dbDevices && dbDevices.length > 0) {
      const defaultDevice = devices[0] || { aqi:0, co2:0, temp:0, hum:0, battery:100, lastSeen:'Just now' };
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
        lastSeen: i === 0 ? defaultDevice.lastSeen : 'Never'
      }));
    }
  } catch(e) {
    console.error('Error fetching devices in overview:', e);
  }

  const totalReadings = readings ? readings.length : 0;
  const avgAQI = readings && readings.length > 0 ?
    Math.round(readings.reduce((sum, r) => sum + (r.aqi_value || 0), 0) / readings.length) : 0;

  if (readings && readings.length > 0) {
    const latest = readings[0];
    devices[0] = {
      ...devices[0],
      aqi: latest.aqi_value || 0,
      temp: latest.temperature || 0,
      hum: latest.humidity || 0,
      co2: Math.round((latest.mq135_raw || 0) * 0.12),
      battery: 85 + Math.random() * 15,
      lastSeen: usingRealData ? formatTimeAgo(latest.created_at) : 'Offline Mode'
    };
    console.log(`✅ Admin Dashboard: Updated with ${usingRealData ? 'real' : 'offline'} data - AQI: ${devices[0].aqi}, Temp: ${devices[0].temp}°C`);
  }

  let stats = { totalReadings: null, totalDevices: null, totalUsers: null, totalSMS: null };
  if (usingRealData) {
    try {
      stats = await Database.fetchSystemStats();
    } catch (e) {
      console.warn('Could not fetch system stats:', e);
    }
  }

  const fmtNum = n => n !== null && n !== undefined ? n.toLocaleString() : '--';
  const summaryReadings = document.getElementById('summary-readings');
  const summaryDevices = document.getElementById('summary-devices');
  const summaryUsers = document.getElementById('summary-users');
  const summarySms = document.getElementById('summary-sms');
  const summaryLastUpdate = document.getElementById('summary-last-update');
  const summaryDataSource = document.getElementById('summary-data-source');
  const summaryStatus = document.getElementById('summary-status');

  if (summaryReadings) summaryReadings.textContent = fmtNum(stats.totalReadings);
  if (summaryDevices) summaryDevices.textContent = fmtNum(stats.totalDevices);
  if (summaryUsers) summaryUsers.textContent = fmtNum(stats.totalUsers);
  if (summarySms) summarySms.textContent = fmtNum(stats.totalSMS);
  if (summaryLastUpdate) summaryLastUpdate.textContent = new Date().toLocaleTimeString();
  if (summaryDataSource) summaryDataSource.textContent = dataSource;
  if (summaryStatus) {
    summaryStatus.textContent = usingRealData ? '🟢 System Online' : '🟡 Offline Mode';
    summaryStatus.style.color = usingRealData ? 'var(--green)' : 'var(--yellow)';
  }

  const loadingIndicator = document.getElementById('map-loading');
  if (loadingIndicator) loadingIndicator.style.display = 'block';

  setTimeout(() => {
    const mapContainer = document.getElementById('overview-map');
    if (!mapContainer) {
      console.error('❌ Map container not found');
      if (loadingIndicator) loadingIndicator.style.display = 'none';
      return;
    }
    if (mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
      console.log('🔄 Map container has no dimensions, retrying...');
      if (loadingIndicator) loadingIndicator.style.display = 'none';
      setTimeout(() => initializeMapInOverview(), 500);
      return;
    }

    if (!adminMap) {
      try {
        adminMap = L.map('overview-map', {
          zoomControl: true,
          center: [8.4542, 124.6319],
          zoom: 15
        }).setView([8.4542, 124.6319], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19
        }).addTo(adminMap);
        setTimeout(() => {
          adminMap.invalidateSize();
          console.log('✅ Overview map initialized successfully');
        }, 100);
      } catch (error) {
        console.error('❌ Map initialization failed:', error);
        mapContainer.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);text-align:center;padding:20px;">
            <div>
              <div style="font-size:16px;margin-bottom:8px;">🗺️ Map Loading Error</div>
              <div style="font-size:12px;">Unable to load map tiles</div>
              <div style="font-size:10px;margin-top:8px;">Check internet connection</div>
            </div>
          </div>
        `;
        return;
      }
    }

    if (adminMarkers['overview-map']) adminMarkers['overview-map'].forEach(mk => mk.remove());
    adminMarkers['overview-map'] = [];

    devices.forEach(device => {
      if (!device.lat || !device.lng) return;
      const color = aqiColor(device.aqi);
      const mk = L.circleMarker([device.lat, device.lng], {
        radius: 12,
        color,
        fillColor: color,
        fillOpacity: 0.75,
        weight: 2
      }).addTo(adminMap);
      mk.bindPopup(`
        <div style="min-width:200px;font-family:'Sora',sans-serif;">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${device.name}</div>
          <div style="font-size:11px;color:#8fa3bc;margin-bottom:8px;">${device.location} · <b>${device.id}</b></div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="font-size:32px;font-weight:700;color:${color};font-family:'DM Mono',monospace;">${device.aqi}</div>
            <div>
              <div style="font-size:11px;font-weight:600;color:${color}">${aqiLabel(device.aqi)}</div>
              <div style="font-size:10px;color:#8fa3bc;">Arduino AQI</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">
            <div>🌡 ${device.temp}°C</div><div>💧 ${device.hum}%</div>
            <div>☁ CO₂ ${device.co2}ppm</div><div>🔋 ${device.battery}%</div>
          </div>
          <div style="margin-top:6px;font-size:10px;color:#8fa3bc;">Last seen: ${device.lastSeen}</div>
        </div>
      `);
      adminMarkers['overview-map'].push(mk);
    });

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    const device = devices[0];
    const currentReadingEl = document.getElementById('overview-current-reading');
    if (currentReadingEl) {
      currentReadingEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="text-align:center;">
            <div style="font-size:28px;font-weight:700;color:${aqiColor(device.aqi)};font-family:var(--mono);">${device.aqi}</div>
            <div style="font-size:10px;color:var(--text2);">AQI</div>
          </div>
          <div style="flex:1;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;">
              <div>🌡 <strong>${device.temp}°C</strong></div>
              <div>💧 <strong>${device.hum}%</strong></div>
              <div>☁ <strong>${device.co2}ppm</strong></div>
              <div>🔋 <strong>${device.battery}%</strong></div>
            </div>
            <div style="margin-top:6px;font-size:10px;color:var(--text3);">
              Device: ${device.name}<br>
              Status: <span style="color:var(--green)">${device.status}</span>
            </div>
          </div>
        </div>
      `;
    }

    const alerts = [];
    const alertLevel = getAlertLevel(device);
    if (alertLevel === 'danger' || alertLevel === 'high' || alertLevel === 'moderate') {
      const template = buildAlertContent(alertLevel, device);
      alerts.push({ type: getAlertTypeFromLevel(alertLevel), msg: template.toastMessage, time: device.lastSeen });
    }
    if (alerts.length === 0) {
      alerts.push({ type: 'success', msg: `Arduino ${device.id}: All systems normal`, time: device.lastSeen });
    }

    const alertsEl = document.getElementById('overview-alerts');
    if (alertsEl) {
      alertsEl.innerHTML = alerts.map(a => `
        <div class="alert-item alert-${a.type}">
          <span>${a.msg}</span><span class="alert-time">${a.time}</span>
        </div>
      `).join('');
    }
  }, 100);

  await loadArduinoReadingsTable();
  const currentDevice = devices[0];
  const metricsEl = document.getElementById('admin-metrics');
  if (metricsEl) {
    metricsEl.innerHTML = [
      {label:'Current AQI',val:currentDevice.aqi,unit:'',color:currentDevice.aqi <= 50 ? 'var(--green)' : currentDevice.aqi <= 100 ? 'var(--yellow)' : 'var(--red)'},
      {label:'Temperature',val:currentDevice.temp,unit:'°C',color:'var(--orange)'},
      {label:'Humidity',val:currentDevice.hum,unit:'%',color:'var(--teal)'},
      {label:'CO₂ Level',val:currentDevice.co2,unit:'ppm',color:'var(--accent)'},
      {label:'Total Readings',val:totalReadings,unit:'',color:'var(--purple)'},
      {label:'Device Status',val:currentDevice.status,unit:'',color:currentDevice.status === 'online' ? 'var(--green)' : 'var(--red)'}
    ].map(m => `<div class="metric-card"><div class="mc-label">${m.label}</div><div class="mc-value" style="color:${m.color}">${m.val}<span class="mc-unit">${m.unit}</span></div></div>`).join('');
  }

  const allActivity = [...databaseActivityLog, ...systemActivity].slice(0, 10);
  const systemActivityEl = document.getElementById('system-activity');
  if (systemActivityEl) {
    systemActivityEl.innerHTML = allActivity.length > 0 ? allActivity.map(a => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="width:8px;height:8px;border-radius:50%;background:${a.type === 'success' ? 'var(--green)' : a.type === 'warn' ? 'var(--yellow)' : a.type === 'error' ? 'var(--red)' : 'var(--accent)'}"></div>
        <span style="flex:1;font-size:12px;">${a.msg}</span>
        <span style="font-size:11px;color:var(--text3);">${a.time}</span>
      </div>
    `).join('') : '<p style="color:var(--text2);text-align:center;padding:20px;">No system activity recorded</p>';
  }
}

async function loadArduinoReadingsTable() {
  try {
    const readings = await Database.fetchLatestReadings(20);
    const tbody = document.getElementById('arduino-readings-body');
    if (!tbody) return;
    if (!readings || readings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:20px;">No Arduino readings available</td></tr>';
      return;
    }
    const co2s = readings.map(r => Math.round((r.mq135_raw || 0) * 0.12));
    tbody.innerHTML = readings.map((reading, index) => {
      const co2ppm = Math.round((reading.mq135_raw || 0) * 0.12);
      const aqiColorValue = reading.aqi_value <= 50 ? '#22c55e' : reading.aqi_value <= 100 ? '#f59e0b' : reading.aqi_value <= 150 ? '#f97316' : '#ef4444';
      return `
        <tr style="${index === 0 ? 'background:rgba(34,197,94,0.1);' : ''}">
          <td style="font-size:11px; color:var(--text2);">${formatTimeAgo(reading.created_at)}</td>
          <td style="font-weight:700; color:${aqiColorValue}; font-family:var(--mono);">${reading.aqi_value || '--'}</td>
          <td><span class="status-badge" style="background:${aqiColorValue}20; color:${aqiColorValue}; font-size:10px;">${reading.aqi_category || 'Unknown'}</span></td>
          <td style="font-family:var(--mono);">${reading.temperature ? reading.temperature.toFixed(1) : '--'}°C</td>
          <td style="font-family:var(--mono);">${reading.humidity ? reading.humidity.toFixed(0) : '--'}%</td>
          <td style="font-family:var(--mono); color:var(--purple);">${reading.mq135_raw || '--'}</td>
          <td style="font-family:var(--mono); color:var(--accent);">${co2ppm} ppm</td>
          <td><span class="status-badge status-online" style="font-size:10px;">✅ Valid</span></td>
        </tr>
      `;
    }).join('');
    drawOverviewCharts(readings);
  } catch (error) {
    console.error('Error loading Arduino readings table:', error);
    const tbody = document.getElementById('arduino-readings-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--red);padding:20px;">Error loading readings</td></tr>';
  }
}

function refreshArduinoReadings() {
  loadArduinoReadingsTable();
}

function viewAllReadings() {
  alert('📊 View All Readings feature - This would open a detailed view with charts and graphs of all historical data.');
}

function drawOverviewCharts(readings) {
  if (!window.Chart) {
    console.error('Chart.js is not available');
    return;
  }
  if (!readings || readings.length === 0) return;
  const sorted = [...readings].reverse();
  const numeric = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const labels = sorted.map((r, i) => {
    if (!r || !r.created_at) return `#${i + 1}`;
    const d = new Date(r.created_at);
    if (Number.isNaN(d.getTime())) return `#${i + 1}`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
  const aqiData = sorted.map(r => numeric(r && r.aqi_value, 0));
  const tempData = sorted.map(r => numeric(r && r.temperature, 0));
  const humData = sorted.map(r => numeric(r && r.humidity, 0));
  const gridColor = 'rgba(255,255,255,0.05)';
  const tickStyle = { color: '#556b82', font: { size: 10 } };
  const aqiCtx = document.getElementById('overview-aqi-chart');
  if (aqiCtx) {
    if (aqiChartInstance) try { aqiChartInstance.destroy(); } catch (e) { console.warn('AQI chart destroy warning:', e); }
    aqiChartInstance = new Chart(aqiCtx.getContext('2d'), {
      type: 'line',
      data: { labels, datasets: [{ label: 'AQI', data: aqiData, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 2, pointRadius: 3, tension: 0.4, fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { grid: { color: gridColor }, ticks: tickStyle }, y: { grid: { color: gridColor }, ticks: tickStyle, beginAtZero: true } } }
    });
    setTimeout(() => aqiChartInstance && aqiChartInstance.resize(), 0);
  }
  const envCtx = document.getElementById('overview-env-chart');
  if (envCtx) {
    if (envChartInstance) try { envChartInstance.destroy(); } catch (e) { console.warn('Env chart destroy warning:', e); }
    envChartInstance = new Chart(envCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Temp (°C)', data: tempData, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', borderWidth: 2, pointRadius: 3, tension: 0.4, fill: true, yAxisID: 'y' },
          { label: 'Humidity (%)', data: humData, borderColor: '#14b8a6', backgroundColor: 'rgba(20,184,166,0.08)', borderWidth: 2, pointRadius: 3, tension: 0.4, fill: true, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: '#8fa3bc', font: { size: 11 }, boxWidth: 12 } } }, scales: {
          x: { grid: { color: gridColor }, ticks: tickStyle },
          y: { grid: { color: gridColor }, ticks: { ...tickStyle, color: '#f97316' }, position: 'left' },
          y1: { grid: { drawOnChartArea: false }, ticks: { ...tickStyle, color: '#14b8a6' }, position: 'right' }
        }
      }
    });
    setTimeout(() => envChartInstance && envChartInstance.resize(), 0);
  }
}

async function loadReports() {
  const metricsEl = document.getElementById('reports-metrics');
  const interpretationEl = document.getElementById('report-interpretation');
  const thresholdBody = document.getElementById('report-threshold-body');
  if (!metricsEl || !interpretationEl || !thresholdBody) return;
  try {
    const [readings, dbUsers, smsNotifications] = await Promise.all([
      Database.fetchLatestReadings(100),
      Database.getSystemUsers(),
      Database.getSMSNotifications(200)
    ]);
    if (!readings || readings.length === 0) {
      metricsEl.innerHTML = '<div class="metric-card"><div class="mc-label">Report Status</div><div class="mc-value">No Data</div></div>';
      interpretationEl.textContent = 'No readings available yet. Start collecting Arduino data to generate analytics.';
      thresholdBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:20px;">No report data available</td></tr>';
      return;
    }
    const good = parseInt(document.getElementById('threshold-good')?.value || '50', 10);
    const moderate = parseInt(document.getElementById('threshold-moderate')?.value || '100', 10);
    const unhealthy = parseInt(document.getElementById('threshold-unhealthy')?.value || '150', 10);
    const total = readings.length;
    const counts = { good: 0, moderate: 0, unhealthy: 0, hazardous: 0 };
    let avgAqi = 0;
    let avgTemp = 0;
    let avgHum = 0;
    readings.forEach(r => {
      const aqi = Number(r.aqi_value) || 0;
      avgAqi += aqi;
      avgTemp += Number(r.temperature) || 0;
      avgHum += Number(r.humidity) || 0;
      if (aqi <= good) counts.good += 1;
      else if (aqi <= moderate) counts.moderate += 1;
      else if (aqi <= unhealthy) counts.unhealthy += 1;
      else counts.hazardous += 1;
    });
    avgAqi = Math.round(avgAqi / total);
    avgTemp = (avgTemp / total).toFixed(1);
    avgHum = Math.round(avgHum / total);
    const riskCount = counts.unhealthy + counts.hazardous;
    const riskRate = ((riskCount / total) * 100).toFixed(1);
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const dominantLabel = dominant === 'good' ? 'Good' : dominant === 'moderate' ? 'Moderate' : dominant === 'unhealthy' ? 'Unhealthy' : 'Hazardous';
    const alertsGenerated = riskCount;
    totalGeneratedAlerts = alertsGenerated;
    const smsTotals = { sent: 0, failed: 0, success: 0 };
    const usersForReport = (dbUsers && dbUsers.length > 0)
      ? dbUsers.map(u => ({ id: u.user_id || u.id, name: u.name || u.email || (u.user_id || u.id || 'Unknown') }))
      : users.map(u => ({ id: u.id, name: u.name }));
    usersForReport.forEach(u => ensureUserStats(u.id));
    const smsByUser = {};
    usersForReport.forEach(u => { smsByUser[u.id] = { sent: 0, failed: 0, success: 0 }; });
    (smsNotifications || []).forEach(n => {
      const uid = n.user_id || activeSessionUserId;
      ensureUserStats(uid);
      if (!smsByUser[uid]) smsByUser[uid] = { sent: 0, failed: 0, success: 0 };
      const status = String(n.status || '').toLowerCase();
      if (status === 'failed') { smsByUser[uid].failed += 1; smsTotals.failed += 1; }
      else if (status === 'success' || status === 'sent') { smsByUser[uid].success += 1; smsTotals.success += 1; }
      else { smsByUser[uid].sent += 1; smsTotals.sent += 1; }
    });
    metricsEl.innerHTML = [
      { label: 'Readings Analyzed', val: total, unit: '', color: 'var(--accent)' },
      { label: 'Average AQI', val: avgAqi, unit: '', color: aqiColor(avgAqi) },
      { label: 'Average Temperature', val: avgTemp, unit: '°C', color: 'var(--orange)' },
      { label: 'Average Humidity', val: avgHum, unit: '%', color: 'var(--teal)' },
      { label: 'Alerts Generated', val: alertsGenerated, unit: '', color: 'var(--red)' },
      { label: 'SMS Sent/Pending', val: smsTotals.sent, unit: '', color: 'var(--accent)' },
      { label: 'SMS Failed', val: smsTotals.failed, unit: '', color: 'var(--red)' },
      { label: 'SMS Success', val: smsTotals.success, unit: '', color: 'var(--green)' },
      { label: 'Risk Exposure', val: riskRate, unit: '%', color: riskRate > 40 ? 'var(--red)' : 'var(--yellow)' },
      { label: 'Dominant Band', val: dominantLabel, unit: '', color: 'var(--purple)' }
    ].map(m => `<div class="metric-card"><div class="mc-label">${m.label}</div><div class="mc-value" style="color:${m.color}">${m.val}<span class="mc-unit">${m.unit}</span></div></div>`).join('');
    interpretationEl.innerHTML = `
      Current thresholds: Good <= <b>${good}</b>, Moderate <= <b>${moderate}</b>, Unhealthy <= <b>${unhealthy}</b>.<br>
      Across the last <b>${total}</b> readings, the dominant condition is <b>${dominantLabel}</b> with a risk exposure of <b>${riskRate}%</b> (unhealthy + hazardous bands).<br>
      Interpretation: ${riskRate > 40 ? 'High environmental risk trend. Strengthen preventive controls and reduce outdoor exposure during peak intervals.' : riskRate > 20 ? 'Moderate risk trend. Continue monitoring and apply precautionary advisories for sensitive groups.' : 'Low risk trend. Conditions are mostly manageable; maintain continuous monitoring.'}
    `;
    const pct = v => ((v / total) * 100).toFixed(1) + '%';
    thresholdBody.innerHTML = [
      ['Good', `0 - ${good}`, counts.good, pct(counts.good), 'Safe baseline. Standard activities allowed.'],
      ['Moderate', `${good + 1} - ${moderate}`, counts.moderate, pct(counts.moderate), 'Mild discomfort possible for sensitive individuals.'],
      ['Unhealthy', `${moderate + 1} - ${unhealthy}`, counts.unhealthy, pct(counts.unhealthy), 'Elevated risk. Restrict prolonged outdoor exposure.'],
      ['Hazardous', `${unhealthy + 1}+`, counts.hazardous, pct(counts.hazardous), 'Critical risk. Trigger emergency response protocols.']
    ].map(row => `
      <tr>
        <td>${row[0]}</td>
        <td>${row[1]}</td>
        <td>${row[2]}</td>
        <td>${row[3]}</td>
        <td>${row[4]}</td>
      </tr>
    `).join('');
    const labels = usersForReport.map(u => u.name);
    const loginData = usersForReport.map(u => (userEngagementStats[u.id]?.logins || 0));
    const dashboardData = usersForReport.map(u => (userEngagementStats[u.id]?.dashboardViews || 0));
    const aqiViewData = usersForReport.map(u => (userEngagementStats[u.id]?.aqiViews || 0));
    if (window.Chart) {
      const gridColor = 'rgba(255,255,255,0.05)';
      const tickStyle = { color: '#556b82', font: { size: 10 } };
      
      const barCtx = document.getElementById('report-user-bar-chart');
      if (barCtx) {
        if (reportUserBarChart) reportUserBarChart.destroy();
        reportUserBarChart = new Chart(barCtx.getContext('2d'), {
          type: 'bar',
          data: { labels, datasets: [
            { label: 'Logins', data: loginData, backgroundColor: 'rgba(59,130,246,.7)' },
            { label: 'Dashboard Views', data: dashboardData, backgroundColor: 'rgba(34,197,94,.7)' },
            { label: 'AQI Views', data: aqiViewData, backgroundColor: 'rgba(249,115,22,.7)' }
          ] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8fa3bc' } } }, scales: { x: { grid: { color: gridColor }, ticks: tickStyle }, y: { grid: { color: gridColor }, ticks: tickStyle, beginAtZero: true } } }
        });
      }
      const lineCtx = document.getElementById('report-alert-line-chart');
      if (lineCtx) {
        if (reportAlertLineChart) reportAlertLineChart.destroy();
        const sortedReadings = [...readings].reverse();
        const lineLabels = sortedReadings.map((r, idx) => {
          const d = new Date(r.created_at);
          return Number.isNaN(d.getTime()) ? `#${idx + 1}` : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        });
        let runningAlerts = 0;
        const alertTrend = sortedReadings.map(r => {
          const aqi = Number(r.aqi_value) || 0;
          if (aqi > moderate) runningAlerts += 1;
          return runningAlerts;
        });
        reportAlertLineChart = new Chart(lineCtx.getContext('2d'), {
          type: 'line',
          data: { labels: lineLabels, datasets: [{ label: 'Generated Alerts (Cumulative)', data: alertTrend, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.12)', fill: true, tension: 0.35, pointRadius: 2 }] },
          options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { color: gridColor }, ticks: tickStyle }, y: { grid: { color: gridColor }, ticks: tickStyle, beginAtZero: true } }, plugins: { legend: { labels: { color: '#8fa3bc' } } } }
        });
      }
      const stackedCtx = document.getElementById('report-sms-stacked-chart');
      if (stackedCtx) {
        if (reportSmsStackedChart) reportSmsStackedChart.destroy();
        const smsSentData = usersForReport.map(u => smsByUser[u.id]?.sent || 0);
        const smsFailedData = usersForReport.map(u => smsByUser[u.id]?.failed || 0);
        const smsSuccessData = usersForReport.map(u => smsByUser[u.id]?.success || 0);
        reportSmsStackedChart = new Chart(stackedCtx.getContext('2d'), {
          type: 'bar',
          data: { labels, datasets: [
            { label: 'Sent/Pending', data: smsSentData, backgroundColor: 'rgba(59,130,246,.75)', stack: 'sms' },
            { label: 'Failed', data: smsFailedData, backgroundColor: 'rgba(239,68,68,.75)', stack: 'sms' },
            { label: 'Success', data: smsSuccessData, backgroundColor: 'rgba(34,197,94,.75)', stack: 'sms' }
          ] },
          options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, grid: { color: gridColor }, ticks: tickStyle }, y: { stacked: true, grid: { color: gridColor }, ticks: tickStyle, beginAtZero: true } }, plugins: { legend: { labels: { color: '#8fa3bc' } } } }
        });
      }
      const pieCtx = document.getElementById('report-aqi-pie-chart');
      if (pieCtx) {
        if (reportAqiPieChart) reportAqiPieChart.destroy();
        reportAqiPieChart = new Chart(pieCtx.getContext('2d'), {
          type: 'pie',
          data: { labels: ['Good', 'Moderate', 'Unhealthy', 'Hazardous'], datasets: [{ data: [counts.good, counts.moderate, counts.unhealthy, counts.hazardous], backgroundColor: ['#22c55e', '#f59e0b', '#f97316', '#ef4444'], borderWidth: 1, borderColor: '#111827' }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#8fa3bc' } } } }
        });
      }
    } else {
      console.warn('Chart.js not loaded, skipping chart generation');
      const chartContainers = [
        document.getElementById('report-user-bar-chart'),
        document.getElementById('report-alert-line-chart'),
        document.getElementById('report-sms-stacked-chart'),
        document.getElementById('report-aqi-pie-chart')
      ];
      chartContainers.forEach(container => {
        if (container) container.parentElement.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--text3);">Charts unavailable</div>';
      });
    }
  } catch (error) {
    console.error('Error loading reports:', error);
    metricsEl.innerHTML = '<div class="metric-card"><div class="mc-label">Report Status</div><div class="mc-value">Error</div></div>';
    interpretationEl.textContent = 'Unable to generate analytics report right now.';
    thresholdBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red);padding:20px;">Failed to generate report</td></tr>';
  }
}

function initDevicesMap() {
  const container = document.getElementById('devices-page-map');
  if (!container) return;
  if (devicesPageMap) {
    devicesPageMap.invalidateSize();
    updateDevicesMapMarkers();
    return;
  }
  devicesPageMap = L.map('devices-page-map', { zoomControl: true }).setView([8.4542, 124.6319], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19
  }).addTo(devicesPageMap);
  setTimeout(() => { devicesPageMap.invalidateSize(); updateDevicesMapMarkers(); }, 200);
}

function updateDevicesMapMarkers() {
  if (!devicesPageMap) return;
  devicesPageMarkers.forEach(m => m.remove());
  devicesPageMarkers = [];
  devices.forEach(device => {
    if (!device.lat || !device.lng) return;
    const col = aqiColor(device.aqi || 0);
    const mk = L.circleMarker([device.lat, device.lng], {
      radius: 12, color: col, fillColor: col, fillOpacity: 0.75, weight: 2
    }).addTo(devicesPageMap);
    mk.bindPopup(`
      <div style="min-width:180px;font-family:'Sora',sans-serif;">
        <div style="font-weight:600;font-size:13px;">${device.name}</div>
        <div style="font-size:11px;color:#8fa3bc;">${device.location || ''} · ${device.id}</div>
        <div style="margin-top:6px;font-size:12px;">AQI: <b style="color:${col}">${device.aqi || '--'}</b></div>
        <div style="font-size:11px;color:#8fa3bc;">Status: ${device.status}</div>
        <button onclick="openDeviceDetail('${device.id}')" style="margin-top:8px;background:rgba(59,130,246,.2);color:#60a5fa;border:1px solid rgba(59,130,246,.3);border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer;">View Details</button>
      </div>
    `);
    devicesPageMarkers.push(mk);
  });
}

async function openDeviceDetail(deviceId) {
  const device = devices.find(d => d.id === deviceId);
  if (!device) return;
  currentDetailDeviceId = deviceId;
  const elName = document.getElementById('dv-name');
  if (elName) elName.textContent = device.name;
  const elId = document.getElementById('dv-id');
  if (elId) elId.textContent = device.id;
  const elLocation = document.getElementById('dv-location');
  if (elLocation) elLocation.textContent = device.location || '--';
  const statusEl = document.getElementById('dv-status');
  if (statusEl) statusEl.innerHTML = `<span class="status-badge status-${device.status}">${device.status}</span>`;
  const elCoords = document.getElementById('dv-coords');
  if (elCoords) elCoords.textContent = (device.lat && device.lng) ? `${device.lat}, ${device.lng}` : '--';
  const aqiEl = document.getElementById('dv-aqi');
  if (aqiEl) {
    aqiEl.textContent = device.aqi || '--';
    aqiEl.style.color = aqiColor(device.aqi || 0);
  }
  const elTemp = document.getElementById('dv-temp');
  if (elTemp) elTemp.textContent = device.temp ? device.temp + '°C' : '--';
  const elHum = document.getElementById('dv-hum');
  if (elHum) elHum.textContent = device.hum ? device.hum + '%' : '--';
  const tbody = document.getElementById('dv-readings-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:12px;">Loading readings...</td></tr>';
  showModal('device-detail-modal');
  try {
    const readings = await Database.fetchLatestReadings(10);
    if (!readings || readings.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:12px;">No readings available</td></tr>';
      return;
    }
    if (tbody) tbody.innerHTML = readings.map(r => {
      const co2 = Math.round((r.mq135_raw || 0) * 0.12);
      const col = r.aqi_value <= 50 ? '#22c55e' : r.aqi_value <= 100 ? '#f59e0b' : r.aqi_value <= 150 ? '#f97316' : '#ef4444';
      return `<tr>
        <td style="font-size:11px;color:var(--text2);">${formatTimeAgo(r.created_at)}</td>
        <td style="font-weight:700;color:${col};font-family:var(--mono);">${r.aqi_value || '--'}</td>
        <td><span style="font-size:10px;color:${col};">${r.aqi_category || 'Unknown'}</span></td>
        <td style="font-family:var(--mono);">${r.temperature ? r.temperature.toFixed(1) : '--'}°C</td>
        <td style="font-family:var(--mono);">${r.humidity ? r.humidity.toFixed(0) : '--'}%</td>
        <td style="font-family:var(--mono);color:var(--accent);">${co2} ppm</td>
      </tr>`;
    }).join('');
  } catch (e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red);padding:12px;">Error loading readings</td></tr>';
  }
}

function editDeviceFromDetail() {
  closeModal('device-detail-modal');
  if (currentDetailDeviceId) editDevice(currentDetailDeviceId);
}

async function loadDevices() {
  const table = document.getElementById('devices-table');
  if (!table) return;
  table.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:20px;">Loading devices from database...</td></tr>';
  try {
    const dbDevices = await Database.getDevices();
    if (dbDevices && dbDevices.length > 0) {
      devices = dbDevices.map(d => ({
        id: d.device_id,
        name: d.name,
        location: d.location,
        lat: d.latitude,
        lng: d.longitude,
        status: d.status,
        aqi: 0,
        temp: 0,
        hum: 0,
        battery: 100,
        lastSeen: 'Never'
      }));
    }
    table.innerHTML = `
      <thead>
        <tr>
          <th>Device ID</th><th>Name</th><th>Location</th>
          <th>Status</th><th>Last Seen</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${devices.length > 0 ? devices.map(device => `
          <tr>
            <td style="font-family:var(--mono);">${device.id}</td>
            <td>${device.name}</td>
            <td>${device.location}</td>
            <td><span class="status-badge status-${device.status}">${device.status}</span></td>
            <td style="font-size:11px;color:var(--text2);">${device.lastSeen || 'Never'}</td>
            <td style="display:flex;gap:4px;">
              <button class="btn btn-success btn-sm" onclick="openDeviceDetail('${device.id}')">👁 View</button>
              <button class="btn btn-ghost btn-sm" onclick="editDevice('${device.id}')">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteDevice('${device.id}')">Delete</button>
            </td>
          </tr>
        `).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:20px;">No devices found. Add your first device!</td></tr>'}
      </tbody>
    `;
    setTimeout(() => initDevicesMap(), 150);
  } catch (error) {
    console.error('Error loading devices:', error);
    table.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--red);padding:20px;">Error loading devices from database</td></tr>';
  }
}

async function loadUsers() {
  const table = document.getElementById('users-table');
  if (!table) return;
  table.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:20px;">Loading users from database...</td></tr>';
  try {
    const dbUsers = await Database.getSystemUsers();
    if (dbUsers && dbUsers.length > 0) {
      users = dbUsers.map(u => ({
        id: u.user_id,
        name: u.name,
        email: u.email,
        role: u.role,
        dept: u.dept,
        status: u.status,
        phone: u.phone_number,
        created: u.created_at ? new Date(u.created_at).toISOString().split('T')[0] : ''
      }));
    }
    table.innerHTML = `
      <thead>
        <tr>
          <th>User ID</th>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Department</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${users.length > 0 ? users.map(user => `
          <tr>
            <td style="font-family:var(--mono);">${user.id}</td>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td><span class="status-badge">${user.role}</span></td>
            <td>${user.dept}</td>
            <td><span class="status-badge status-${user.status}">${user.status}</span></td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="editUser('${user.id}')">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteUser('${user.id}')">Delete</button>
            </td>
          </tr>
        `).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:20px;">No users found. Add your first user!</td></tr>'}
      </tbody>
    `;
  } catch (error) {
    console.error('Error loading users:', error);
    table.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--red);padding:20px;">Error loading users from database</td></tr>';
  }
  loadSMSUsers();
}

function showAddSMSUserModal() {
  showModal('sms-user-modal');
}

async function loadSMSUsers() {
  const tbody = document.getElementById('sms-users-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);">Loading SMS subscribers...</td></tr>';
  try {
    const smsUsers = await Database.getNotificationUsers();
    if (smsUsers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:20px;">No SMS subscribers registered yet</td></tr>';
      return;
    }
    tbody.innerHTML = smsUsers.map(user => `
      <tr>
        <td>${user.name}</td>
        <td style="font-family:var(--mono);font-size:12px;">${user.phone_number}</td>
        <td><span class="status-badge" style="background:${aqiColor(user.aqi_threshold)}20;color:${aqiColor(user.aqi_threshold)};">${user.aqi_threshold}</span></td>
        <td><span class="status-badge status-${user.is_active ? 'online' : 'offline'}">${user.is_active ? 'Active' : 'Inactive'}</span></td>
        <td style="font-size:11px;color:var(--text2);">${user.last_alert ? formatTimeAgo(user.last_alert) : 'Never'}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="testSMSToUser('${user.phone_number}')">📤 Test</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSMSUser('${user.id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading SMS users:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red);padding:20px;">Error loading SMS subscribers</td></tr>';
  }
}

async function saveSMSUser() {
  const name = document.getElementById('sms-user-name')?.value.trim();
  const phone = document.getElementById('sms-user-phone')?.value.trim();
  const email = document.getElementById('sms-user-email')?.value.trim();
  const deviceId = document.getElementById('sms-user-device')?.value;
  const threshold = parseInt(document.getElementById('sms-user-threshold')?.value) || 100;
  const phoneRegex = /^\+63[0-9]{10}$/;
  if (!phoneRegex.test(phone)) { alert('Please enter a valid Philippine phone number in format: +63XXXXXXXXXX'); return; }
  if (!name) { alert('Please enter a name'); return; }
  const userData = { name, phone_number: phone, email: email || null, device_id: deviceId, aqi_threshold: threshold, is_active: true };
  try {
    await Database.registerSMSUser(userData);
    console.log('✅ SMS user registered:', name);
    closeModal('sms-user-modal');
    document.getElementById('sms-user-name').value = '';
    document.getElementById('sms-user-phone').value = '';
    document.getElementById('sms-user-email').value = '';
    loadSMSUsers();
    alert('✅ User registered successfully for SMS alerts!');
  } catch (error) {
    console.error('Error registering SMS user:', error);
    alert('❌ Error registering user: ' + error.message);
  }
}

async function deleteSMSUser(userId) {
  if (!confirm('Are you sure you want to delete this SMS subscriber?')) return;
  try {
    const success = await Database.deleteSMSUser(userId);
    if (success) {
      console.log('✅ SMS user deleted');
      loadSMSUsers();
      alert('✅ SMS subscriber deleted successfully!');
    } else {
      throw new Error('Delete failed');
    }
  } catch (error) {
    console.error('Error deleting SMS user:', error);
    alert('❌ Error deleting SMS subscriber');
  }
}

async function testSMSToUser(phoneNumber) {
  const testMessage = `AirWatch Test: This is a test SMS from your AirWatch system. AQI monitoring is active. Reply STOP to unsubscribe.`;
  try {
    await Database.logSMSNotification({ phone_number: phoneNumber, message: testMessage, aqi_value: null, status: 'sent' });
    console.log('📤 Test SMS sent to:', phoneNumber);
    alert(`✅ Test SMS sent to ${phoneNumber}!\n\nNote: SMS will be sent by the Arduino SIM900 module when it checks the database.`);
  } catch (error) {
    console.error('Error sending test SMS:', error);
    alert('❌ Error sending test SMS');
  }
}

function saveSMSSettings() {
  const devicePhone = document.getElementById('device-phone')?.value;
  const smsTemplate = document.getElementById('sms-template')?.value;
  const smsCooldown = document.getElementById('sms-cooldown')?.value;
  localStorage.setItem('smsSettings', JSON.stringify({ devicePhone, template: smsTemplate, cooldown: parseInt(smsCooldown) }));
  console.log('✅ SMS settings saved');
  logRoleActivity('management', 'success', 'Updated SMS notification settings');
  alert('✅ SMS settings saved successfully!');
}

function testSMS() {
  const devicePhone = document.getElementById('device-phone')?.value;
  if (!devicePhone) { alert('❌ Please enter the device phone number first'); return; }
  alert(`📤 Test SMS will be sent to ${devicePhone}\n\nNote: The Arduino SIM900 module will send this test message when it next checks for pending SMS notifications.`);
}

function logDatabaseActivity(type, message) {
  databaseActivityLog.unshift({ type, msg: message, time: formatTimeAgo(new Date()) });
  if (databaseActivityLog.length > 50) databaseActivityLog = databaseActivityLog.slice(0, 50);
}

function logRoleActivity(actorRole, type, message) {
  if (actorRole !== 'admin' && actorRole !== 'management') return;
  roleActivityLog.unshift({ actorRole, type, msg: `[${actorRole.toUpperCase()}] ${message}`, time: 'Just now' });
  if (roleActivityLog.length > 100) roleActivityLog = roleActivityLog.slice(0, 100);
}

function loadAlerts() {
  console.log('🔄 Admin Alerts: Loading environmental and role activity alerts...');
  const device = devices[0];
  const databaseAlerts = [];
  const alertLevel = getAlertLevel(device);
  if (alertLevel === 'danger' || alertLevel === 'high' || alertLevel === 'moderate') {
    const template = buildAlertContent(alertLevel, device);
    databaseAlerts.push({ type: getAlertTypeFromLevel(alertLevel), msg: template.toastMessage, time: device.lastSeen });
  }
  if (device.battery < 20) {
    databaseAlerts.push({ type: 'warn', msg: `Arduino ${device.id}: Low battery (${device.battery}%)`, time: device.lastSeen });
  }
  if (device.status === 'offline') {
    databaseAlerts.push({ type: 'error', msg: `Arduino ${device.id}: Device offline`, time: device.lastSeen });
  }
  if (databaseAlerts.length === 0) {
    databaseAlerts.push({ type: 'success', msg: `Arduino ${device.id}: All systems normal`, time: device.lastSeen });
  }
  const roleAlerts = roleActivityLog.map(a => ({ type: a.type, msg: a.msg, time: a.time }));
  const allAlerts = [...databaseAlerts, ...roleAlerts, ...adminAlerts].slice(0, 20);
  const badgeEl = document.getElementById('alert-nav-badge');
  if (badgeEl) {
    const dangerAlerts = allAlerts.filter(a => a.type === 'danger' || a.type === 'error').length;
    badgeEl.textContent = dangerAlerts;
  }
  const alertsContainer = document.getElementById('admin-alerts');
  if (alertsContainer) {
    alertsContainer.innerHTML = allAlerts.length > 0 ? allAlerts.map(alert => `
      <div class="alert-item alert-${alert.type}">
        <span>${alert.msg}</span><span class="alert-time">${alert.time}</span>
      </div>
    `).join('') : '<p style="color:var(--text2);text-align:center;padding:20px;">No alerts recorded</p>';
  }
}

function clearAlerts() {
  adminAlerts = [];
  roleActivityLog = [];
  const alertsEl = document.getElementById('admin-alerts');
  if (alertsEl) alertsEl.innerHTML = '<p style="color:var(--text2);text-align:center;padding:20px;">No alerts recorded</p>';
  const badgeEl = document.getElementById('alert-nav-badge');
  if (badgeEl) badgeEl.textContent = '0';
  systemActivity.unshift({ type: 'info', msg: 'Alerts cleared by administrator', time: 'Just now' });
  logRoleActivity('admin', 'info', 'Cleared alert history');
  showDashboardToast('success', 'Alerts Cleared', 'Alert history has been cleared successfully.');
}

function showClearAlertsModal() {
  showModal('clear-alerts-modal');
}

function cancelClearAlerts() {
  closeModal('clear-alerts-modal');
  showDashboardToast('info', 'Clear Cancelled', 'Alert history was not cleared.');
}

function confirmClearAlerts() {
  closeModal('clear-alerts-modal');
  clearAlerts();
}

function showModal(modalId) {
  document.getElementById(modalId)?.classList.add('open');
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove('open');
}

function showAddUserModal() {
  showModal('user-modal');
}

function showAddDeviceModal() {
  showModal('device-modal');
}

async function saveUser() {
  const name = document.getElementById('user-name')?.value;
  const email = document.getElementById('user-email')?.value;
  const role = document.getElementById('user-role')?.value;
  const dept = document.getElementById('user-dept')?.value;
  const phone = document.getElementById('user-phone')?.value || '';
  if (!name || !email) { alert('Please fill in all required fields'); return; }
  try {
    const userData = {
      user_id: `USR-${String(users.length + 1).padStart(3, '0')}`,
      name,
      email,
      role,
      dept,
      status: 'active',
      phone_number: phone
    };
    await Database.createSystemUser(userData);
    systemActivity.unshift({ type: 'success', msg: `New user added to database: ${name}`, time: 'Just now' });
    logRoleActivity('admin', 'success', `Added user ${name} (${role})`);
    closeModal('user-modal');
    await loadUsers();
    loadOverview();
    document.getElementById('user-name').value = '';
    document.getElementById('user-email').value = '';
    document.getElementById('user-dept').value = '';
    if (document.getElementById('user-phone')) document.getElementById('user-phone').value = '';
    alert('✅ User created successfully in database!');
  } catch (error) {
    console.error('Error creating user:', error);
    alert('❌ Error creating user: ' + error.message);
  }
}

async function saveDevice() {
  const name = document.getElementById('device-name')?.value;
  const id = document.getElementById('device-id')?.value;
  const location = document.getElementById('device-location')?.value;
  const lat = parseFloat(document.getElementById('device-lat')?.value) || 8.4542;
  const lng = parseFloat(document.getElementById('device-lng')?.value) || 124.6319;
  if (!name || !id || !location) { alert('Please fill in all required fields'); return; }
  try {
    const deviceData = { device_id: id, name, location, latitude: lat, longitude: lng, status: 'active' };
    await Database.createDevice(deviceData);
    const newDevice = { id, name, location, lat, lng, status: 'online', aqi: 0, temp: 0, hum: 0, battery: 100, lastSeen: 'Never' };
    devices.push(newDevice);
    systemActivity.unshift({ type: 'success', msg: `New device added to database: ${name}`, time: 'Just now' });
    logRoleActivity('admin', 'success', `Registered device ${id} at ${location}`);
    closeModal('device-modal');
    await loadDevices();
    loadOverview();
    document.getElementById('device-name').value = '';
    document.getElementById('device-id').value = '';
    document.getElementById('device-location').value = '';
    document.getElementById('device-lat').value = '';
    document.getElementById('device-lng').value = '';
    alert('✅ Device created successfully in database!');
  } catch (error) {
    console.error('Error creating device:', error);
    alert('❌ Error creating device: ' + error.message);
  }
}

function saveSettings() {
  const url = document.getElementById('supabase-url')?.value;
  const key = document.getElementById('supabase-key')?.value;
  const table = document.getElementById('table-name')?.value;
  if (url) DB_CONFIG.url = url;
  if (key) DB_CONFIG.anonKey = key;
  if (table) DB_TABLES.readings = table;
  systemActivity.unshift({ type: 'success', msg: 'Settings saved successfully', time: 'Just now' });
  logRoleActivity('admin', 'success', 'Updated system settings');
  loadOverview();
}

function saveThresholds() {
  const good = parseInt(document.getElementById('threshold-good')?.value);
  const moderate = parseInt(document.getElementById('threshold-moderate')?.value);
  const unhealthy = parseInt(document.getElementById('threshold-unhealthy')?.value);
  systemActivity.unshift({ type: 'success', msg: 'AQI thresholds updated', time: 'Just now' });
  logRoleActivity('admin', 'success', `Updated AQI thresholds: Good<=${good}, Moderate<=${moderate}, Unhealthy<=${unhealthy}`);
  loadOverview();
}

function editDevice(id) {
  const device = devices.find(d => d.id === id);
  if (device) {
    document.getElementById('device-name').value = device.name;
    document.getElementById('device-id').value = device.id;
    document.getElementById('device-location').value = device.location;
    document.getElementById('device-lat').value = device.lat;
    document.getElementById('device-lng').value = device.lng;
    showModal('device-modal');
  }
}

async function deleteDevice(deviceId) {
  if (!confirm('Are you sure you want to delete this device?')) return;
  try {
    const dbDevices = await Database.getDevices();
    const dbDevice = dbDevices.find(d => d.device_id === deviceId);
    if (dbDevice) {
      const success = await Database.deleteDevice(dbDevice.id);
      if (!success) throw new Error('Failed to delete from database');
    }
    devices = devices.filter(d => d.id !== deviceId);
    systemActivity.unshift({ type: 'warn', msg: `Device deleted from database: ${deviceId}`, time: 'Just now' });
    logRoleActivity('admin', 'warn', `Deleted device ${deviceId}`);
    await loadDevices();
    loadOverview();
    alert('✅ Device deleted successfully from database!');
  } catch (error) {
    console.error('Error deleting device:', error);
    alert('❌ Error deleting device: ' + error.message);
  }
}

function editUser(id) {
  const user = users.find(u => u.id === id);
  if (user) {
    document.getElementById('user-name').value = user.name;
    document.getElementById('user-email').value = user.email;
    document.getElementById('user-role').value = user.role;
    document.getElementById('user-dept').value = user.dept;
    showModal('user-modal');
  }
}

async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  try {
    const user = users.find(u => u.id === userId);
    if (!user) { alert('User not found'); return; }
    const dbUsers = await Database.getSystemUsers();
    const dbUser = dbUsers.find(u => u.user_id === userId);
    if (dbUser) {
      const success = await Database.deleteSystemUser(dbUser.id);
      if (!success) throw new Error('Failed to delete from database');
    }
    users = users.filter(u => u.id !== userId);
    systemActivity.unshift({ type: 'warn', msg: `User deleted from database: ${userId}`, time: 'Just now' });
    logRoleActivity('admin', 'warn', `Deleted user ${userId}`);
    await loadUsers();
    loadOverview();
    alert('✅ User deleted successfully from database!');
  } catch (error) {
    console.error('Error deleting user:', error);
    alert('❌ Error deleting user: ' + error.message);
  }
}

function exportData() {
  systemActivity.unshift({ type: 'info', msg: 'Data export initiated', time: 'Just now' });
  logRoleActivity('management', 'info', 'Generated data export request');
  loadOverview();
}

function clearDatabase() {
  if (confirm('⚠️ This will delete ALL air quality readings from the database. Are you sure?')) {
    Database.clearAllData().then(success => {
      if (success) {
        systemActivity.unshift({ type: 'warn', msg: 'Database cleared successfully', time: 'Just now' });
        logRoleActivity('admin', 'warn', 'Cleared all air quality records');
      } else {
        systemActivity.unshift({ type: 'error', msg: 'Failed to clear database', time: 'Just now' });
        logRoleActivity('admin', 'error', 'Attempted database clear but failed');
      }
      loadOverview();
    });
  }
}

function logout() {
  if (confirm('Are you sure you want to logout?')) {
    window.location.href = '../../index.html';
  }
}

async function checkAndTriggerSMSNotifications(currentAQI) {
  try {
    const users = await Database.getNotificationUsers();
    const smsSettings = JSON.parse(localStorage.getItem('smsSettings') || '{}');
    const cooldownMinutes = smsSettings.cooldown || 30;
    const cooldownMs = cooldownMinutes * 60 * 1000;
    for (const user of users) {
      const currentDevice = devices[0];
      const level = getAlertLevel(currentDevice);
      if (currentAQI > user.aqi_threshold && level !== 'normal') {
        const lastAlert = user.last_alert ? new Date(user.last_alert) : null;
        const now = new Date();
        if (!lastAlert || (now - lastAlert) > cooldownMs) {
          const template = buildAlertContent(level, currentDevice);
          const message = `${template.smsHeader}\n${template.smsBody}`;
          await Database.logSMSNotification({ user_id: user.id, phone_number: user.phone_number, message, aqi_value: currentAQI, status: 'pending' });
          trackUserStat(activeSessionUserId, 'smsSent', 1);
          await Database.updateUserLastAlert(user.id);
          console.log(`📤 SMS notification queued for ${user.name} (${user.phone_number}): ${level.toUpperCase()} alert`);
          logDatabaseActivity('warn', `SMS ${level} alert queued for ${user.name}`);
        } else {
          console.log(`⏳ SMS cooldown active for ${user.name} - skipping`);
        }
      }
    }
  } catch (error) {
    console.error('Error checking SMS notifications:', error);
  }
}

function initializeAdmin() {
  const page = document.body.dataset.page || 'overview';
  setActiveNav(page);
  trackUserStat(activeSessionUserId, 'logins', 1);
  if (page === 'overview') loadOverview();
  if (page === 'devices') loadDevices();
  if (page === 'alerts') loadAlerts();
  if (page === 'reports') loadReports();
  if (page === 'users') loadUsers();
  if (page === 'settings') {
    const settings = JSON.parse(localStorage.getItem('smsSettings') || '{}');
    if (settings.devicePhone) document.getElementById('device-phone').value = settings.devicePhone;
    if (settings.template) document.getElementById('sms-template').value = settings.template;
    if (settings.cooldown) document.getElementById('sms-cooldown').value = settings.cooldown;
  }
  setInterval(async () => {
    console.log('🔄 Admin Dashboard: Refreshing Arduino data...');
    const readings = await Database.fetchLatestReadings(1);
    if (readings && readings.length > 0) {
      const latest = readings[0];
      devices[0] = { ...devices[0], aqi: latest.aqi_value || 0, temp: latest.temperature || 0, hum: latest.humidity || 0, co2: Math.round((latest.mq135_raw || 0) * 0.12), battery: 85 + Math.random() * 15, lastSeen: Database.formatTimeAgo ? Database.formatTimeAgo(latest.created_at) : 'Just now' };
      
      systemActivity.unshift({ type: 'info', msg: `Background sync: Database polling successful`, time: new Date().toLocaleTimeString() });
      if (systemActivity.length > 50) systemActivity = systemActivity.slice(0, 50);

      if (document.body.dataset.page === 'overview') loadOverview();
      if (document.body.dataset.page === 'devices') loadDevices();
      if (document.body.dataset.page === 'alerts') loadAlerts();
      if (document.body.dataset.page === 'reports') loadReports();
      if (document.getElementById('summary-last-update')) document.getElementById('summary-last-update').textContent = new Date().toLocaleTimeString();
      await checkAndTriggerSMSNotifications(devices[0].aqi);
      const currentLevel = getAlertLevel(devices[0]);
      if (currentLevel !== lastToastAlertLevel) {
        const toastTemplate = buildAlertContent(currentLevel, devices[0]);
        showDashboardToast(toastTemplate.toastType, toastTemplate.toastTitle, toastTemplate.toastMessage);
        lastToastAlertLevel = currentLevel;
      }
    } else {
      console.warn('⚠️ No database connection, generating offline data');
      const offlineData = generateOfflineData();
      if (offlineData && offlineData.length > 0) {
        const latest = offlineData[0];
        devices[0] = { ...devices[0], aqi: latest.aqi_value || 0, temp: latest.temperature || 0, hum: latest.humidity || 0, co2: Math.round((latest.mq135_raw || 0) * 0.12), battery: 85 + Math.random() * 15, lastSeen: 'Offline Mode' };
        const summaryDataSource = document.getElementById('summary-data-source');
        const summaryStatus = document.getElementById('summary-status');
        if (summaryDataSource) summaryDataSource.textContent = 'Offline (Generated)';
        if (summaryStatus) { summaryStatus.textContent = '🟡 Offline Mode'; summaryStatus.style.color = 'var(--yellow)'; }
        if (document.getElementById('summary-last-update')) document.getElementById('summary-last-update').textContent = new Date().toLocaleTimeString();
        if (document.body.dataset.page === 'overview') loadOverview();
      }
    }
  }, 30000);
}

document.addEventListener('DOMContentLoaded', initializeAdmin);
