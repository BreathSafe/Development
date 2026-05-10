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
  async fetchReadingsForDevice(deviceId, limit = 10) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.readings}?device_id=eq.${deviceId}&order=created_at.desc&limit=${limit}`,
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
      console.error(`Error fetching readings for ${deviceId}:`, error);
      return [];
    }
  },

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
        // Use select=* and limit=1 with count=exact to get total count across different ID schemas
        const res = await fetch(
          `${DB_CONFIG.url}/rest/v1/${table}?select=*${filter}&limit=1`,
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
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(userData)
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error creating system user:', error);
      throw error;
    }
  },

  async updateSystemUser(user_id, userData) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.systemUsers}?user_id=eq.${user_id}`,
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
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return true;
    } catch (error) {
      console.error('Error updating system user:', error);
      throw error;
    }
  },

  async deleteSystemUser(user_id) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.systemUsers}?user_id=eq.${user_id}`,
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
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(deviceData)
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error creating device:', error);
      throw error;
    }
  },

  async updateDevice(device_id, deviceData) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.devices}?device_id=eq.${device_id}`,
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
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return true;
    } catch (error) {
      console.error('Error updating device:', error);
      throw error;
    }
  },

  async getDevice(device_id) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.devices}?device_id=eq.${device_id}`,
        {
          headers: {
            'apikey': DB_CONFIG.anonKey,
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`
          }
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Error fetching device:', error);
      return null;
    }
  },

  async deleteDevice(device_id) {
    try {
      const response = await fetch(
        `${DB_CONFIG.url}/rest/v1/${DB_TABLES.devices}?device_id=eq.${device_id}`,
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
  },

  async updateDeviceStatus(deviceId, status) {
    try {
      await fetch(`${DB_CONFIG.url}/rest/v1/${DB_TABLES.devices}?device_id=eq.${deviceId}`, {
        method: 'PATCH',
        headers: {
          'apikey': DB_CONFIG.anonKey,
          'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: status })
      });
    } catch (e) {
      console.error('Error updating device status in DB:', e);
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
      const response = await fetch(`${DB_CONFIG.url}/rest/v1/${DB_TABLES.activity}`, {
        method: 'POST',
        headers: {
          'apikey': DB_CONFIG.anonKey,
          'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          ...activity,
          actor: activity.actor || 'Admin'
        })
      });
      return response.ok;
    } catch (error) {
      console.error('Error logging activity:', error);
      return false;
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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching activity:', error);
      return [];
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
      device_id: 'AW-001',
      temperature: 28.5,
      humidity: 45.0,
      mq135_raw: 280,
      aqi_value: 25,
      aqi_category: 'Good'
    });
  }
  logRoleActivity('system', 'warn', 'Connectivity Loss: System running in offline fallback mode', 'hardware');
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
      smsHeader: 'BreatheSafe Community Advisory (MODERATE)',
      smsBody: `Location: ${location}\nTime: ${time}\nAir Quality: ${airQuality}\nHealth Note: Air is slightly polluted. Sensitive groups should be aware.\nAdvice: Limit heavy outdoor exertion and stay hydrated.`,
      toastType: 'info',
      toastTitle: 'Moderate Air Condition',
      toastMessage: `Community Advisory: Slightly degraded air quality at ${location}. Sensitive individuals should consider precautions.`
    },
    high: {
      smsHeader: 'BreatheSafe PUBLIC WARNING (HIGH RISK)',
      smsBody: `Location: ${location}\nTime: ${time}\nAir Quality: ${airQuality}\nHealth Risk: Potential for dizziness, fatigue, and breathing discomfort.\nCommunity Action: Stay indoors where possible. Suspend heavy outdoor activities.`,
      toastType: 'warn',
      toastTitle: 'High Risk Condition',
      toastMessage: `Public Warning: Poor air quality and high heat at ${location}. Community advised to stay indoors and hydrate.`
    },
    danger: {
      smsHeader: 'BreatheSafe EMERGENCY ALERT (CRITICAL)',
      smsBody: `Location: ${location}\nTime: ${time}\nAir Quality: ${airQuality}\nCRITICAL RISK: Hazardous air and extreme heat levels detected.\nURGENT ACTION: Clear outdoor areas immediately. Ensure everyone is in a safe environment.`,
      toastType: 'error',
      toastTitle: 'Critical Health Alert',
      toastMessage: `Emergency Alert: Hazardous conditions at ${location}. Immediate safety measures required for the community.`
    },
    normal: {
      smsHeader: 'BreatheSafe Awareness Update',
      smsBody: `Location: ${location}\nTime: ${time}\nStatus: All environmental parameters are currently within safe ranges.\nNote: Air quality is Good.`,
      toastType: 'success',
      toastTitle: 'Environment Safe',
      toastMessage: `Awareness Update: Air quality and temperature at ${location} are within optimal safety ranges.`
    }
  };
  return templates[level] || templates.normal;
}

function showDashboardToast(type, title, message, duration = 6000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:80px;right:16px;display:flex;flex-direction:column;gap:10px;z-index:10000;max-width:280px;';
    document.body.appendChild(container);
  }
  const palette = {
    success: { bg: 'rgba(34,197,94,.92)', border: 'rgba(34,197,94,1)', icon: '✅' },
    info: { bg: 'rgba(59,130,246,.92)', border: 'rgba(59,130,246,1)', icon: 'ℹ️' },
    warn: { bg: 'rgba(245,158,11,.92)', border: 'rgba(245,158,11,1)', icon: '⚠️' },
    error: { bg: 'rgba(239,68,68,.92)', border: 'rgba(239,68,68,1)', icon: '🚨' }
  };
  const color = palette[type] || palette.info;
  const toast = document.createElement('div');
  toast.className = 'dashboard-toast';
  toast.style.cssText = `background:${color.bg};border:1px solid ${color.border};color:#fff;border-radius:10px;padding:10px 14px;font-size:12px;line-height:1.4;box-shadow:0 8px 24px rgba(0,0,0,.3);position:relative;animation:toastSlideIn .3s ease;cursor:default;transition:all .3s ease;`;
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  toast.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:10px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:14px;">${color.icon}</span>
        <div style="font-weight:700;">${title}</div>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:14px;padding:0;opacity:0.6;">✕</button>
    </div>
    <div style="opacity:0.9;font-size:11px;">${message}</div>
    <div style="position:absolute;bottom:0;left:0;height:2px;background:rgba(255,255,255,0.3);width:100%;border-radius:0 0 10px 10px;transform-origin:left;animation:toastProgress ${duration}ms linear forwards;"></div>
  `;
  
  container.appendChild(toast);

  const dismiss = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px) scale(0.95)';
    setTimeout(() => toast.remove(), 300);
  };

  const timeout = setTimeout(dismiss, duration);
  toast.onmouseenter = () => { clearTimeout(timeout); };
  toast.onmouseleave = () => { setTimeout(dismiss, 2000); };
}

let devices = [
  { id:'AW-001', name:'Air Quality Monitor', location:'Your Location', lat:8.4542, lng:124.6319, status:'online', aqi:0, temp:0, hum:0, battery:100, lastReadingTime: null }
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
let currentEditingUserId = null;
let currentEditingDeviceId = null;
let aqiChartInstance = null;
let envChartInstance = null;
let pollutantChartInstance = null;
let reportUserBarChart = null;
let reportAlertLineChart = null;
let reportSmsStackedChart = null;
let reportAqiPieChart = null;
let reportPollutantLineChart = null;
let reportPollutantPieChart = null;
let currentAlertFilter = 'all';
let modalMap = null;
let modalMarker = null;

function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
}

function navigateToPage(page) {
  window.location.href = `${page}.html`;
}

function getHardwareAlerts() {
  const device = devices[0];
  if (!device) return [];
  const alerts = [];
  // Use the actual reading time from DB, or a fixed old date if no data exists yet
  const timestamp = device.lastReadingTime || '1970-01-01T00:00:00.000Z';
  const alertLevel = getAlertLevel(device);
  if (alertLevel !== 'normal') {
    const template = buildAlertContent(alertLevel, device);
    alerts.push({
      type: getAlertTypeFromLevel(alertLevel),
      msg: template.toastMessage,
      time: device.lastSeen || 'Just now',
      category: 'environment',
      created_at: timestamp
    });
  }
  if (device.battery < 20) {
    alerts.push({
      type: 'warn',
      msg: `Arduino ${device.id}: Low battery (${device.battery}%)`,
      time: device.lastSeen || 'Just now',
      category: 'hardware',
      created_at: timestamp
    });
  }
  return alerts;
}

const ALERT_COUNT_KEY = 'breathsafe_alert_count';
const BADGE_FETCH_LIMIT = 50;

function computeUnreadCount(allAlerts) {
  const lastRead = localStorage.getItem('alerts_last_read');
  return allAlerts.filter(a =>
    (!lastRead || new Date(a.created_at) > new Date(lastRead)) &&
    (a.type === 'danger' || a.type === 'warn' || a.type === 'error')
  ).length;
}

function updateAlertBadge(allAlerts) {
  const badgeEl = document.getElementById('alert-nav-badge');
  if (!badgeEl) return;
  const unreadCount = computeUnreadCount(allAlerts);
  badgeEl.textContent = unreadCount > 0 ? unreadCount : '';
  badgeEl.style.display = unreadCount > 0 ? 'block' : 'none';
  localStorage.setItem(ALERT_COUNT_KEY, String(unreadCount));
}

function renderCachedAlertBadge() {
  const badgeEl = document.getElementById('alert-nav-badge');
  if (!badgeEl) return;
  const cached = localStorage.getItem(ALERT_COUNT_KEY) || '0';
  badgeEl.textContent = cached !== '0' ? cached : '';
  badgeEl.style.display = cached !== '0' ? 'block' : 'none';
}

async function loadOverview() {
  console.log('🔄 Admin Dashboard: Fetching Arduino data from Supabase...');
  let readings = null;
  let usingRealData = false;
  let dataSource = 'Offline (Mock Data)';

  try {
    let dbReadings = await Database.fetchLatestReadings(50); 
    // Filter out empty/ghost records
    readings = (dbReadings || []).filter(r => r.mq135_raw !== null || r.aqi_value !== null);
    
    if (readings && readings.length > 0) {
      usingRealData = true;
      dataSource = 'Supabase Database';
      console.log(`✅ Admin Dashboard: Connected to database - ${readings.length} valid readings found`);
      if (!systemActivity.some(a => a.msg && a.msg.includes('Connected to database'))) {
        logRoleActivity('admin', 'success', `Connected to database: Fetched ${readings.length} readings`, 'admin');
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
      devices = dbDevices.map(d => {
        // Match this device to its latest reading from the 'readings' pool
        const latest = readings ? readings.find(r => r.device_id === d.device_id) : null;
        
        return {
          id: d.device_id,
          name: d.name,
          location: d.location,
          lat: d.latitude,
          lng: d.longitude,
          status: d.status,
          aqi: latest ? (latest.aqi_value || 0) : 0,
          temp: latest ? (latest.temperature || 0) : 0,
          hum: latest ? (latest.humidity || 0) : 0,
          co2: latest ? Math.round((latest.mq135_raw || 0) * 0.12) : 0,
          battery: 100,
          lastSeen: latest ? formatTimeAgo(latest.created_at) : 'Never',
          lastReadingTime: latest ? latest.created_at : null
        };
      });
      
      // Sort devices so the one with the most recent data is first (for the main summary card)
      devices.sort((a, b) => {
        if (a.lastSeen === 'Never') return 1;
        if (b.lastSeen === 'Never') return -1;
        return 0; // We'd need actual dates for better sorting, but this is a start
      });
    }
  } catch(e) {
    console.error('Error fetching devices in overview:', e);
  }

  if (readings && readings.length > 0) {
    const latest = readings[0];
    console.log(`✅ Admin Dashboard: Latest Reading - AQI: ${latest.aqi_value}, Device: ${latest.device_id}`);
    if (latest.aqi_value > 100) await checkAndTriggerSMSNotifications(latest.aqi_value);
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

    const hwAlerts = getHardwareAlerts();
    const alertsToShow = hwAlerts.length > 0 ? hwAlerts : [{ type: 'success', msg: `Arduino ${device.id}: All systems normal`, time: device.lastSeen }];

    const alertsEl = document.getElementById('overview-alerts');
    if (alertsEl) {
      alertsEl.innerHTML = alertsToShow.map(a => `
        <div class="alert-item alert-${a.type}">
          <span>${a.msg}</span><span class="alert-time">${a.time}</span>
        </div>
      `).join('');
    }
  }, 100);

  // Update badge with DB + hardware alerts for consistency across all pages
  try {
    const dbActivity = await Database.fetchActivity(BADGE_FETCH_LIMIT);
    const dbAlerts = (dbActivity || []).map(a => ({
      type: a.type,
      created_at: a.created_at
    }));
    const hwAlerts = getHardwareAlerts();
    updateAlertBadge([...dbAlerts, ...hwAlerts]);
  } catch (e) {
    // Fallback to hardware-only badge if DB fetch fails
    updateAlertBadge(getHardwareAlerts());
  }

  await loadArduinoReadingsTable();
  const currentDevice = devices[0];
  const metricsEl = document.getElementById('admin-metrics');
  if (metricsEl) {
    metricsEl.innerHTML = [
      {label:'Current AQI',val:currentDevice.aqi,unit:'',color:currentDevice.aqi <= 50 ? 'var(--green)' : currentDevice.aqi <= 100 ? 'var(--yellow)' : 'var(--red)'},
      {label:'Temperature',val:currentDevice.temp,unit:'°C',color:'var(--orange)'},
      {label:'Humidity',val:currentDevice.hum,unit:'%',color:'var(--teal)'},
      {label:'CO₂ Level',val:currentDevice.co2,unit:'ppm',color:'var(--accent)'},
      {label:'Total Readings',val:(stats && stats.totalReadings !== null ? stats.totalReadings : '--'),unit:'',color:'var(--purple)'},
      {label:'Device Status',val:currentDevice.status,unit:'',color:currentDevice.status === 'online' ? 'var(--green)' : 'var(--red)'}
    ].map(m => `<div class="metric-card"><div class="mc-label">${m.label}</div><div class="mc-value" style="color:${m.color}">${m.val}<span class="mc-unit">${m.unit}</span></div></div>`).join('');
  }

  let dbActivity = [];
  try {
    dbActivity = await Database.fetchActivity(10);
  } catch (e) { console.warn('Activity fetch failed'); }

  const formattedDbActivity = (dbActivity || []).map(a => ({
    type: a.type,
    msg: a.message,
    time: Database.formatTimeAgo(a.created_at)
  }));

  const allActivity = [...systemActivity, ...(dbActivity || [])].slice(0, 10);
  const systemActivityEl = document.getElementById('system-activity');
  if (systemActivityEl) {
    systemActivityEl.innerHTML = allActivity.length > 0 ? allActivity.map(a => {
      const isDb = !!a.id;
      const msg = isDb ? a.message : a.msg;
      const type = a.type;
      const time = isDb ? Database.formatTimeAgo(a.created_at) : a.time;
      const category = a.category || 'general';
      
      let icon = 'ℹ️';
      if (category === 'hardware') icon = '📡';
      if (category === 'sms') icon = '📤';
      if (category === 'user') icon = '👤';
      if (category === 'device' || category === 'admin') icon = '🛠️';
      if (type === 'danger' || type === 'error') icon = '🚨';

      return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
          <div style="font-size:16px; width:24px; text-align:center;">${icon}</div>
          <div style="flex:1;">
            <div style="font-size:12px; font-weight:600; color:var(--text2); line-height:1.3;">${msg}</div>
            <div style="display:flex; justify-content:space-between; margin-top:3px;">
              <span style="font-size:9px; color:var(--text3); text-transform:uppercase; letter-spacing:0.05em;">${category}</span>
              <span style="font-size:9px; color:var(--text3);">${time}</span>
            </div>
          </div>
        </div>
      `;
    }).join('') : '<p style="color:var(--text2);text-align:center;padding:20px;">No system activity recorded</p>';
  }
}

function setAlertFilter(filter, btnElement) {
  currentAlertFilter = filter;
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(t => t.classList.remove('active'));
  if (btnElement) {
    btnElement.classList.add('active');
  } else {
    // Fallback if not clicked directly
    tabs[0].classList.add('active');
  }
  loadAlerts();
}

async function loadArduinoReadingsTable() {
  try {
    let readings = await Database.fetchLatestReadings(50);
    // Filter out 'empty' readings (must have either raw MQ135 or AQI value)
    readings = (readings || []).filter(r => (r.mq135_raw !== null && r.mq135_raw !== undefined) || (r.aqi_value !== null && r.aqi_value !== undefined));
    
    const tbody = document.getElementById('arduino-readings-body');
    if (!tbody) return;
    if (readings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text2);padding:20px;">No valid Arduino readings available</td></tr>';
      return;
    }
    
    // Only show recent 10 records
    const recentTen = readings.slice(0, 10);
    
    tbody.innerHTML = recentTen.map((reading, index) => {
      // 1. Resolve AQI (Use DB value, or fallback to calculation, or 0)
      let displayAqi = reading.aqi_value;
      if (displayAqi === null || displayAqi === undefined) {
        displayAqi = reading.mq135_raw ? Math.max(0, Math.round((reading.mq135_raw - 150) * 300 / 2350)) : 0;
      }
      
      const aqiColorValue = aqiColor(displayAqi);
      
      // 2. Resolve CO2 (Use DB value or fallback with 400ppm baseline)
      const co2Val = reading.co2_ppm ? Math.round(reading.co2_ppm) : Math.round((reading.mq135_raw || 0) * 0.12 + 400);
      
      // 3. Resolve Alcohol
      const alcVal = (reading.alcohol_ppm !== null && reading.alcohol_ppm !== undefined) ? reading.alcohol_ppm.toFixed(1) : '--';

      return `
        <tr style="${index === 0 ? 'background:rgba(34,197,94,0.1);' : ''}">
          <td style="font-size:11px; color:var(--text2);">${formatTimeAgo(reading.created_at)}</td>
          <td style="font-weight:700; color:${aqiColorValue}; font-family:var(--mono);">${displayAqi}</td>
          <td><span class="status-badge" style="background:${aqiColorValue}20; color:${aqiColorValue}; font-size:10px;">${reading.aqi_category || aqiLabel(displayAqi)}</span></td>
          <td style="font-family:var(--mono);">${(reading.temperature !== null && reading.temperature !== undefined) ? reading.temperature.toFixed(1) + '°C' : '--'}</td>
          <td style="font-family:var(--mono);">${(reading.humidity !== null && reading.humidity !== undefined) ? reading.humidity.toFixed(0) + '%' : '--'}</td>
          <td style="font-family:var(--mono); color:var(--purple);">${reading.mq135_raw || '--'}</td>
          <td style="font-family:var(--mono); font-size:10px;">
            <div style="color:var(--accent);">CO₂: ${co2Val}</div>
            <div style="color:var(--teal); opacity:0.8;">ALC: ${alcVal}</div>
          </td>
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
  const aqiData = sorted.map(r => r.aqi_value !== null ? numeric(r.aqi_value) : null);
  const tempData = sorted.map(r => r.temperature !== null ? numeric(r.temperature) : null);
  const humData = sorted.map(r => r.humidity !== null ? numeric(r.humidity) : null);
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
  
  const polCtx = document.getElementById('overview-pollutant-chart');
  if (polCtx) {
    if (pollutantChartInstance) try { pollutantChartInstance.destroy(); } catch (e) {}
    const co2Data = sorted.map(r => numeric(r.co2_ppm || (r.mq135_raw * 0.12), 400));
    const nh3Data = sorted.map(r => numeric(r.nh3_ppm, 0));
    const bzData  = sorted.map(r => numeric(r.benzene_ppm, 0));
    const alcData = sorted.map(r => numeric(r.alcohol_ppm, 0));

    pollutantChartInstance = new Chart(polCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'CO₂', data: co2Data, backgroundColor: 'rgba(168,85,247,0.6)', borderRadius: 4 },
          { label: 'NH₃', data: nh3Data, backgroundColor: 'rgba(34,197,94,0.6)', borderRadius: 4 },
          { label: 'Benzene', data: bzData, backgroundColor: 'rgba(239,68,68,0.6)', borderRadius: 4 },
          { label: 'Alcohol', data: alcData, backgroundColor: 'rgba(20,184,166,0.6)', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8fa3bc', boxWidth: 10, font: { size: 10 } } } },
        scales: { x: { grid: { color: gridColor }, ticks: tickStyle }, y: { grid: { color: gridColor }, ticks: tickStyle, beginAtZero: true } }
      }
    });
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
      interpretationEl.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text2);padding:20px;">No readings available yet. Start collecting Arduino data to generate analytics.</td></tr>';
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
    const pct = v => ((v / total) * 100).toFixed(1) + '%';
    const riskText = riskRate > 40 ? 'High environmental risk' : riskRate > 20 ? 'Moderate risk trend' : 'Low risk trend';
    const riskDesc = riskRate > 40 ? 'Strengthen preventive controls and reduce outdoor exposure during peak intervals.' : riskRate > 20 ? 'Continue monitoring and apply precautionary advisories for sensitive groups.' : 'Conditions are mostly manageable; maintain continuous monitoring.';
    const aqiStatus = avgAqi <= good ? 'Good' : avgAqi <= moderate ? 'Moderate' : avgAqi <= unhealthy ? 'Unhealthy' : 'Hazardous';
    const aqiStatusColor = avgAqi <= good ? 'var(--green)' : avgAqi <= moderate ? 'var(--yellow)' : avgAqi <= unhealthy ? 'var(--orange)' : 'var(--red)';
    interpretationEl.innerHTML = [
      ['Average AQI', `${avgAqi}`, `<span style="color:${aqiStatusColor}">${aqiStatus}</span>`],
      ['Average Temperature', `${avgTemp} °C`, `${avgTemp > 35 ? 'Hot' : avgTemp < 18 ? 'Cold' : 'Normal'}`],
      ['Average Humidity', `${avgHum}%`, `${avgHum > 80 ? 'High' : avgHum < 30 ? 'Low' : 'Normal'}`],
      ['Dominant Condition', `${dominantLabel}`, `${counts[dominant]} of ${total} readings (${pct(counts[dominant])})`],
      ['Risk Exposure', `${riskRate}%`, `${riskText}. ${riskDesc}`],
      ['Alerts Generated', `${alertsGenerated}`, `${alertsGenerated > 0 ? 'Elevated risk periods detected' : 'No elevated risk periods'}`],
      ['Total Readings', `${total}`, 'Dataset size for this report'],
      ['Current Thresholds', `Good ≤ ${good}, Moderate ≤ ${moderate}, Unhealthy ≤ ${unhealthy}`, 'Applied AQI bands']
    ].map(row => `
      <tr>
        <td style="font-weight:600;color:var(--text);">${row[0]}</td>
        <td style="font-family:var(--mono);color:var(--accent);">${row[1]}</td>
        <td style="color:var(--text2);font-size:12px;">${row[2]}</td>
      </tr>
    `).join('');
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
      
      const pollLineCtx = document.getElementById('report-pollutant-line-chart');
      if (pollLineCtx) {
        if (reportPollutantLineChart) reportPollutantLineChart.destroy();
        const sortedReadings = [...readings].reverse();
        console.log('📊 Generating Pollutant Report for', sortedReadings.length, 'readings');
        
        const lineLabels = sortedReadings.map((r, idx) => {
          const d = new Date(r.created_at);
          return Number.isNaN(d.getTime()) ? `#${idx + 1}` : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        });
        
        // Use calculated fallbacks if specific PPM columns are missing
        const getVal = (val, raw, factor, base = 0) => {
          const n = Number(val);
          if (Number.isFinite(n) && n > 0) return n;
          return Math.round((Number(raw) || 0) * factor) + base;
        };

        reportPollutantLineChart = new Chart(pollLineCtx.getContext('2d'), {
          type: 'line',
          data: {
            labels: lineLabels,
            datasets: [
              { label: 'CO₂ (ppm)', data: sortedReadings.map(r => getVal(r.co2_ppm, r.mq135_raw, 0.12, 400)), borderColor: '#a855f7', backgroundColor: 'rgba(168,85,247,0.1)', fill: true, tension: 0.3, pointRadius: 1 },
              { label: 'NH₃ (ppm)', data: sortedReadings.map(r => getVal(r.nh3_ppm, r.mq135_raw, 0.08)), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.3, pointRadius: 1 },
              { label: 'Benzene (ppm)', data: sortedReadings.map(r => getVal(r.benzene_ppm, r.mq135_raw, 0.04)), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3, pointRadius: 1 },
              { label: 'Alcohol (ppm)', data: sortedReadings.map(r => getVal(r.alcohol_ppm, r.mq135_raw, 0.06)), borderColor: '#14b8a6', backgroundColor: 'rgba(20,184,166,0.1)', fill: true, tension: 0.3, pointRadius: 1 }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
              x: { grid: { color: gridColor }, ticks: tickStyle },
              y: { grid: { color: gridColor }, ticks: tickStyle, beginAtZero: true }
            },
            plugins: { legend: { labels: { color: '#8fa3bc', boxWidth: 12, font: { size: 11 } } } }
          }
        });

        // Pollutant Pie Chart — average concentration share
        const pollPieCtx = document.getElementById('report-pollutant-pie-chart');
        if (pollPieCtx) {
          if (reportPollutantPieChart) reportPollutantPieChart.destroy();
          const avgCo2 = sortedReadings.reduce((s, r) => s + getVal(r.co2_ppm, r.mq135_raw, 0.12, 400), 0) / sortedReadings.length;
          const avgNh3 = sortedReadings.reduce((s, r) => s + getVal(r.nh3_ppm, r.mq135_raw, 0.08), 0) / sortedReadings.length;
          const avgBenzene = sortedReadings.reduce((s, r) => s + getVal(r.benzene_ppm, r.mq135_raw, 0.04), 0) / sortedReadings.length;
          const avgAlcohol = sortedReadings.reduce((s, r) => s + getVal(r.alcohol_ppm, r.mq135_raw, 0.06), 0) / sortedReadings.length;
          reportPollutantPieChart = new Chart(pollPieCtx.getContext('2d'), {
            type: 'pie',
            data: {
              labels: ['CO₂', 'NH₃', 'Benzene', 'Alcohol'],
              datasets: [{
                data: [avgCo2, avgNh3, avgBenzene, avgAlcohol],
                backgroundColor: ['#a855f7', '#22c55e', '#ef4444', '#14b8a6'],
                borderWidth: 1,
                borderColor: '#111827'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'bottom', labels: { color: '#8fa3bc' } },
                tooltip: {
                  callbacks: {
                    label: function(context) {
                      const val = context.raw;
                      const total = context.dataset.data.reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
                      return ` ${context.label}: ${val.toFixed(1)} ppm (${pct}%)`;
                    }
                  }
                }
              }
            }
          });
        }
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
      <div style="min-width:200px;font-family:'Sora',sans-serif;">
        <div style="font-weight:600;font-size:13px;">${device.name}</div>
        <div style="font-size:11px;color:#8fa3bc;margin-bottom:8px;">${device.location || ''} · ${device.id}</div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          <div style="background:rgba(59,130,246,.1);padding:6px;border-radius:6px;text-align:center;">
            <div style="font-size:9px;color:#8fa3bc;text-transform:uppercase;">AQI</div>
            <div style="font-weight:700;color:${col};font-size:14px;">${device.aqi || '--'}</div>
          </div>
          <div style="background:var(--bg3);padding:6px;border-radius:6px;text-align:center;">
            <div style="font-size:9px;color:#8fa3bc;text-transform:uppercase;">Status</div>
            <div style="font-size:11px;color:${device.status === 'active' ? 'var(--green)' : 'var(--red)'}">${device.status}</div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-top:1px solid var(--border);">
          <span>🌡️ Temp:</span><span style="font-weight:600;">${device.temp ? device.temp.toFixed(1) + '°C' : '--'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;">
          <span>💧 Humidity:</span><span style="font-weight:600;">${device.hum ? device.hum.toFixed(0) + '%' : '--'}</span>
        </div>

        <button onclick="openDeviceDetail('${device.id}')" style="margin-top:10px;width:100%;background:var(--accent);color:#fff;border:none;border-radius:6px;padding:6px;font-size:11px;font-weight:600;cursor:pointer;">📡 View Detailed Analysis</button>
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
  
  const consoleEl = document.getElementById('dv-console');
  if (consoleEl) consoleEl.innerHTML = '<span style="opacity:0.5;">[SYSTEM] Establishing remote connection...</span>';
  
  showModal('device-detail-modal');
  
  // Start Console Polling
  if (consoleInterval) clearInterval(consoleInterval);
  refreshConsole(deviceId);
  consoleInterval = setInterval(() => refreshConsole(deviceId), 5000);

  try {
    // 1. Fetch the very latest reading for this specific device to update the header
    const deviceReadings = await Database.fetchReadingsForDevice(deviceId, 10);
    
    if (deviceReadings && deviceReadings.length > 0) {
      const latest = deviceReadings[0];
      
      // Update header with real data from DB
      if (aqiEl) {
        aqiEl.textContent = latest.aqi_value || '--';
        aqiEl.style.color = aqiColor(latest.aqi_value || 0);
      }
      if (elHum) elHum.textContent = latest.humidity ? latest.humidity.toFixed(0) + '%' : '--';
      
      // Update Hardware Integrity Status
      const updateStat = (id, working) => {
        const el = document.getElementById(id);
        if (el) {
          el.textContent = working ? '🟢' : '🔴';
          el.title = working ? 'Sensor Operating Normally' : 'Sensor Malfunction or No Data';
        }
      };

      const isOnline = device.status === 'active' || (new Date() - new Date(latest.created_at) < 180000); // 3 min heartbeat
      updateStat('stat-esp32', isOnline);
      updateStat('stat-dht11', isOnline && latest.temperature !== null && latest.humidity !== null);
      updateStat('stat-mq135', isOnline && latest.mq135_raw !== null);
      updateStat('stat-gps', isOnline && latest.latitude !== null && latest.longitude !== null);
      
      // SIM900 check: assume working if online and no recent SMS failures logged specifically as 'danger' for this user/device
      updateStat('stat-sim900', isOnline); 
      
      // Update the table with the recent history
      if (tbody) {
        tbody.innerHTML = deviceReadings.map(r => {
          const col = r.aqi_value <= 50 ? '#22c55e' : r.aqi_value <= 100 ? '#f59e0b' : r.aqi_value <= 150 ? '#f97316' : '#ef4444';
          
          // Use specific gas values if available, otherwise fallback to generic estimate
          const co2 = r.co2_ppm ? Math.round(r.co2_ppm) : Math.round((r.mq135_raw || 0) * 0.12);
          const nh3 = r.nh3_ppm ? r.nh3_ppm.toFixed(2) : '--';
          const benzene = r.benzene_ppm ? r.benzene_ppm.toFixed(3) : '--';

          return `<tr>
            <td style="font-size:11px;color:var(--text2);">${formatTimeAgo(r.created_at)}</td>
            <td style="font-weight:700;color:${col};font-family:var(--mono);">${r.aqi_value || '--'}</td>
            <td><span style="font-size:10px;color:${col};">${r.aqi_category || 'Unknown'}</span></td>
            <td style="font-family:var(--mono);">${r.temperature ? r.temperature.toFixed(1) : '--'}°C</td>
            <td style="font-family:var(--mono);">${r.humidity ? r.humidity.toFixed(0) : '--'}%</td>
            <td style="font-family:var(--mono);color:var(--accent); font-size:10px;">
              <div title="Carbon Dioxide">CO₂: ${co2}</div>
              <div title="Ammonia" style="opacity:0.8;">NH₃: ${nh3}</div>
              <div title="Benzene" style="opacity:0.8;">BZ: ${benzene}</div>
            </td>
          </tr>`;
        }).join('');
      }
      // Highlight likely pollutants based on AQI
      const pollutantsEl = document.getElementById('dv-pollutants');
      if (pollutantsEl) {
        const aqi = latest.aqi_value || 0;
        const spans = pollutantsEl.querySelectorAll('span');
        spans.forEach(span => {
          if (aqi > 100) {
            span.style.borderColor = 'rgba(239,68,68,.4)';
            span.style.background = 'rgba(239,68,68,.1)';
            span.style.color = '#fca5a5';
            span.style.borderStyle = 'solid';
            span.style.borderWidth = '1px';
          } else {
            span.style.borderColor = 'transparent';
            span.style.background = 'var(--bg3)';
            span.style.color = 'var(--text2)';
            span.style.borderStyle = 'none';
          }
        });
      }
    } else {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:12px;">No historical readings found for this device</td></tr>';
      // Fallback to empty values if no readings exist
      if (aqiEl) aqiEl.textContent = '--';
      if (document.getElementById('dv-temp')) document.getElementById('dv-temp').textContent = '--';
      if (document.getElementById('dv-hum')) document.getElementById('dv-hum').textContent = '--';
    }
  } catch (e) {
    console.error('Error loading device details:', e);
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red);padding:12px;">Error loading data from server</td></tr>';
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
    const [dbDevices, latestReadings] = await Promise.all([
      Database.getDevices(),
      Database.fetchLatestReadings(50)
    ]);

    if (dbDevices && dbDevices.length > 0) {
      devices = await Promise.all(dbDevices.map(async d => {
        // Fetch the specific latest reading for THIS device
        const latestResponse = await fetch(`${DB_CONFIG.url}/rest/v1/${DB_TABLES.readings}?device_id=eq.${d.device_id}&select=*&order=created_at.desc&limit=1`, {
          headers: { 'apikey': DB_CONFIG.anonKey, 'Authorization': `Bearer ${DB_CONFIG.anonKey}` }
        });
        const latestData = await latestResponse.json();
        const latest = latestData && latestData.length > 0 ? latestData[0] : null;

        return {
          id: d.device_id,
          name: d.name,
          location: d.location,
          lat: d.latitude,
          lng: d.longitude,
          status: d.status,
          aqi: latest ? latest.aqi_value : null,
          temp: latest ? latest.temperature : null,
          hum: latest ? latest.humidity : null,
          battery: 100,
          lastSeen: latest ? formatTimeAgo(latest.created_at) : 'Never'
        };
      }));
    }

    table.innerHTML = `
      <thead>
        <tr>
          <th>Device ID</th><th>Name</th><th>Location</th>
          <th>Status</th><th>AQI</th><th>Temp/Hum</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${devices.length > 0 ? devices.map(device => `
          <tr>
            <td style="font-family:var(--mono);">${device.id}</td>
            <td>${device.name}</td>
            <td>${device.location}</td>
            <td><span class="status-badge status-${device.status}">${device.status}</span></td>
            <td style="text-align:center;">
              ${device.aqi !== null ? 
                `<b style="color:${aqiColor(device.aqi)}; font-family:var(--mono); font-size:14px;">${device.aqi}</b>` : 
                `<span style="color:var(--text3); font-size:11px;">No Data</span>`
              }
            </td>
            <td style="font-size:11px;font-family:var(--mono);">
              ${device.temp !== null ? device.temp.toFixed(1) + '°C' : '--'} / ${device.hum !== null ? device.hum.toFixed(0) + '%' : '--'}
            </td>
            <td style="display:flex;gap:4px;">
              <button class="btn btn-success btn-sm" onclick="openDeviceDetail('${device.id}')">👁 View</button>
              <button class="btn btn-ghost btn-sm" onclick="editDevice('${device.id}')">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteDevice('${device.id}')">Delete</button>
            </td>
          </tr>
        `).join('') : '<tr><td colspan="7" style="text-align:center;padding:20px;">No devices found. Add your first device!</td></tr>'}
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
          <button class="btn btn-primary btn-sm" onclick="triggerManualSMS('${user.phone_number}', '${user.name}')">📤 Broadcast</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSMSUser('${user.id}')">Delete</button>
        </td>
      </tr>
    `).join('');

    // Initialize Toggle State
    const autoSms = localStorage.getItem('auto_sms_enabled') === 'false' ? false : true;
    const toggleEl = document.getElementById('global-auto-sms');
    const labelEl = document.getElementById('auto-sms-status-label');
    if (toggleEl) toggleEl.checked = autoSms;
    if (labelEl) {
      labelEl.textContent = `Auto-Broadcast: ${autoSms ? 'ON' : 'OFF'}`;
      labelEl.style.color = autoSms ? 'var(--green)' : 'var(--text3)';
    }
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
  let threshold = parseInt(document.getElementById('sms-user-threshold')?.value);
  if (isNaN(threshold) || threshold < 1) threshold = 100; // Force default if empty or invalid
  const phoneRegex = /^\+63[0-9]{10}$/;
  if (!phoneRegex.test(phone)) { 
    showDashboardToast('error', 'Invalid Phone', 'Please enter a valid Philippine phone number: +63XXXXXXXXXX');
    return; 
  }
  if (!name) { 
    showDashboardToast('error', 'Missing Name', 'Please enter a name for the subscriber.');
    return; 
  }
  const userData = { name, phone_number: phone, email: email || null, device_id: deviceId, aqi_threshold: threshold, is_active: true };
  try {
    await Database.registerSMSUser(userData);
    console.log('✅ SMS user registered:', name);
    closeModal('sms-user-modal');
    document.getElementById('sms-user-name').value = '';
    document.getElementById('sms-user-phone').value = '';
    document.getElementById('sms-user-email').value = '';
    loadSMSUsers();
    logRoleActivity('admin', 'success', `Registered SMS subscriber: ${name} (${phone})`, 'user');
    showDashboardToast('success', 'Subscriber Registered', `User ${name} has been successfully registered for SMS alerts.`);
  } catch (error) {
    console.error('Error registering SMS user:', error);
    showDashboardToast('error', 'Registration Failed', error.message);
  }
}

async function deleteSMSUser(userId) {
  showConfirmModal('Delete Subscriber', 'Are you sure you want to remove this SMS subscriber? They will no longer receive environmental alerts.', async () => {
    try {
      const success = await Database.deleteSMSUser(userId);
      if (success) {
        console.log('✅ SMS user deleted');
        loadSMSUsers();
        logRoleActivity('admin', 'warn', `Removed SMS subscriber (ID: ${userId})`, 'user');
        showDashboardToast('success', 'Subscriber Removed', 'The SMS subscriber has been successfully removed.');
      } else {
        throw new Error('Delete failed');
      }
    } catch (error) {
      console.error('Error deleting SMS user:', error);
      showDashboardToast('error', 'Delete Failed', 'Unable to remove the SMS subscriber.');
    }
  });
}

function toggleAutoSMS() {
  const toggle = document.getElementById('global-auto-sms');
  const label = document.getElementById('auto-sms-status-label');
  const isEnabled = toggle?.checked;
  
  localStorage.setItem('auto_sms_enabled', isEnabled);
  
  if (label) {
    label.textContent = `Auto-Broadcast: ${isEnabled ? 'ON' : 'OFF'}`;
    label.style.color = isEnabled ? 'var(--green)' : 'var(--text3)';
  }

  const msg = isEnabled ? 'Automatic SMS broadcasts ENABLED' : 'Automatic SMS broadcasts DISABLED';
  const type = isEnabled ? 'success' : 'warn';
  logRoleActivity('admin', type, msg, 'sms');
  showDashboardToast(type, 'SMS Settings', msg);
}

async function triggerManualSMS(phone, name) {
  showConfirmModal('Send Manual Alert', `Are you sure you want to send an immediate air quality advisory to ${name} (${phone})?`, async () => {
    try {
      const device = devices[0];
      const aqi = device.aqi || 0;
      const template = buildAlertContent(getAlertLevel(device), device);
      const msg = `Manual Advisory: ${template.smsHeader}\n${template.smsBody}`;
      
      const success = await Database.logSMSNotification({
        phone_number: phone,
        message: msg,
        aqi_value: aqi,
        status: 'pending'
      });

      if (success) {
        showDashboardToast('success', 'Alert Sent', `Manual advisory successfully queued for ${name}.`);
        logRoleActivity('admin', 'info', `Manual SMS alert sent to ${name}`, 'sms');
        loadSMSUsers();
      }
    } catch (e) {
      console.error('Manual SMS failed:', e);
      showDashboardToast('error', 'Send Failed', 'Could not queue the SMS notification.');
    }
  }, 'info');
}

async function testSMSToUser(phoneNumber) {
  const testMessage = `BreathSafe Test: This is a test SMS from your BreathSafe system. AQI monitoring is active. Reply STOP to unsubscribe.`;
  try {
    await Database.logSMSNotification({ phone_number: phoneNumber, message: testMessage, aqi_value: null, status: 'sent' });
    console.log('📤 Test Broadcast sent to:', phoneNumber);
    showConfirmModal('Broadcast Test Queued', `✅ Test advisory has been queued for ${phoneNumber}.\n\nNote: The ESP32 Gateway will broadcast this message once it syncs with the database.`, () => {}, 'success');
  } catch (error) {
    console.error('Error sending test SMS:', error);
    showDashboardToast('error', 'Broadcast Failed', 'Unable to queue the test message.');
  }
}

function saveSMSSettings() {
  const devicePhone = document.getElementById('device-phone')?.value;
  const smsTemplate = document.getElementById('sms-template')?.value;
  const smsCooldown = document.getElementById('sms-cooldown')?.value;
  localStorage.setItem('smsSettings', JSON.stringify({ devicePhone, template: smsTemplate, cooldown: parseInt(smsCooldown) }));
  console.log('✅ Awareness settings saved');
  logRoleActivity('admin', 'success', 'Updated Community Awareness & Public Alert settings');
  showDashboardToast('success', 'Settings Saved', 'Awareness configurations updated successfully!');
}

function testSMS() {
  const devicePhone = document.getElementById('device-phone')?.value;
  if (!devicePhone) { 
    showDashboardToast('error', 'Missing Number', 'Please enter the gateway phone number first.'); 
    return; 
  }
  showConfirmModal('Broadcast Test', `📤 A test advisory will be sent to the gateway at ${devicePhone}.\n\nNote: The ESP32 Gateway will broadcast this test message when it next checks for pending notifications.`, () => {}, 'info');
}

function logDatabaseActivity(type, message) {
  databaseActivityLog.unshift({ type, msg: message, time: formatTimeAgo(new Date()) });
  if (databaseActivityLog.length > 50) databaseActivityLog = databaseActivityLog.slice(0, 50);
}

function logRoleActivity(actorRole, type, message, category = 'system') {
  const actor = actorRole === 'admin' ? 'Administrator' : actorRole === 'management' ? 'Management' : 'System';
  
  // Push to local activity for immediate UI feedback
  systemActivity.unshift({
    type,
    msg: message,
    time: 'Just now',
    category,
    actor: actor
  });
  
  if (systemActivity.length > 50) systemActivity.pop();
  
  // Also push to roleActivityLog for compatibility with other views if needed
  roleActivityLog.unshift({ actorRole, type, msg: message, time: 'Just now' });
  if (roleActivityLog.length > 100) roleActivityLog = roleActivityLog.slice(0, 100);
  
  // Persist to database
  Database.logActivity({ type, message, category, actor: actor });
}

async function loadAlerts() {
  console.log('🔄 Syncing System Alerts from Database...');
  
  const categoryFilter = currentAlertFilter || 'all';
  const severityFilter = document.getElementById('severity-filter')?.value || 'all';
  const sortOrder = document.getElementById('alert-sort')?.value || 'newest';

  // 1. Fetch persistent activity logs from DB
  const dbActivity = await Database.fetchActivity(BADGE_FETCH_LIMIT);
  let allAlerts = (dbActivity || []).map(a => {
    let cat = a.category || 'system';

    // HISTORICAL FIX: Re-route specific message types that might have been mis-categorized in the past
    if (a.message && (a.message.includes('Broadcast Failure') || a.message.includes('queued for'))) {
      cat = 'sms';
    }

    return {
      id: a.id,
      type: a.type,
      msg: a.message,
      time: Database.formatTimeAgo(a.created_at),
      absTime: new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      category: cat,
      created_at: a.created_at
    };
  });

  // 2. Local hardware alerts
  const hwAlerts = getHardwareAlerts();
  allAlerts.push(...hwAlerts);

  // Update badge from unfiltered data so count is consistent across pages
  updateAlertBadge(allAlerts);

  // 3. Apply Category Filter
  let filteredAlerts = [...allAlerts];
  if (categoryFilter !== 'all') {
    filteredAlerts = filteredAlerts.filter(a => {
      if (categoryFilter === 'hardware') return a.category === 'hardware' || a.category === 'environment' || a.category === 'location';
      if (categoryFilter === 'sms') return a.category === 'sms';
      if (categoryFilter === 'user') return a.category === 'user' || a.category === 'device' || a.category === 'auth';
      return a.category === categoryFilter;
    });
  }

  // 4. Apply Severity Filter
  if (severityFilter !== 'all') {
    filteredAlerts = filteredAlerts.filter(a => {
      if (severityFilter === 'critical') return a.type === 'danger' || a.type === 'error';
      if (severityFilter === 'warning') return a.type === 'warn';
      if (severityFilter === 'info') return a.type === 'info' || a.type === 'success';
      return true;
    });
  }

  // 5. Apply Sorting
  filteredAlerts.sort((a, b) => {
    const dateA = new Date(a.created_at);
    const dateB = new Date(b.created_at);
    return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
  });

  // Update UI List
  const alertsContainer = document.getElementById('admin-alerts');
  if (alertsContainer) {
    const lastRead = localStorage.getItem('alerts_last_read');
    alertsContainer.innerHTML = filteredAlerts.length > 0 ? filteredAlerts.map(alert => {
      const isUnread = !lastRead || (alert.created_at && new Date(alert.created_at) > new Date(lastRead));
      
      // Map technical category to human-readable label
      let displayCat = 'System';
      if (['hardware', 'environment', 'location'].includes(alert.category)) displayCat = 'Device';
      if (['sms'].includes(alert.category)) displayCat = 'Broadcast';
      if (['user', 'device', 'auth'].includes(alert.category)) displayCat = 'Admin';

      return `
        <div class="alert-item alert-${alert.type}" style="${isUnread ? 'border-left: 3px solid var(--accent);' : 'opacity: 0.8;'}">
          <div style="display:flex; flex-direction:column; width:100%; gap:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:${isUnread ? '700' : '600'};">${alert.msg} ${isUnread ? '<span style="color:var(--accent); font-size:8px; vertical-align:middle;">●</span>' : ''}</span>
              <span class="cat-badge" style="background:rgba(255,255,255,0.1); color:var(--text2);">${displayCat}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-family:var(--mono); font-size:10px;">
              <span style="color:var(--text2);">${alert.time}</span>
              <span style="opacity:0.6;">${alert.absTime || 'Just now'}</span>
            </div>
          </div>
        </div>
      `;
    }).join('') : `<div style="text-align:center;padding:60px 20px;color:var(--text3);">
        <div style="font-size:40px;margin-bottom:12px;opacity:0.3;">📂</div>
        <p>No ${filteredAlerts.length === 0 ? categoryFilter !== 'all' ? categoryFilter : '' : ''} alerts found for the current filters.</p>
      </div>`;
  }
}

function setAlertFilter(category, btn) {
  currentAlertFilter = category;
  
  // Update Tab UI
  if (btn && btn.parentElement) {
    btn.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  
  loadAlerts();
}

function markAlertsAsRead() {
  localStorage.setItem('alerts_last_read', new Date().toISOString());
  loadAlerts();
  showDashboardToast('info', 'Alerts Read', 'All notifications have been marked as read.');
}

function showMarkReadModal() {
  showConfirmModal('Mark as Read', 'Do you want to mark all recent alerts as read? This will reset the notification count.', () => {
    markAlertsAsRead();
  }, 'info');
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
      showDashboardToast('success', 'GPS Sync Successful', `Location retrieved from Device ${deviceId}: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } else {
      throw new Error(`No GPS data found for device <strong>${deviceId}</strong> in the database. Ensure the device is powered on and has a GPS fix.`);
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
  if (modalId === 'device-detail-modal' && consoleInterval) {
    clearInterval(consoleInterval);
    consoleInterval = null;
  }
}

let consoleInterval = null;
async function refreshConsole(deviceId) {
  const consoleEl = document.getElementById('dv-console');
  if (!consoleEl) return;
  try {
    const response = await fetch(`${DB_CONFIG.url}/rest/v1/${DB_TABLES.activity}?category=eq.hardware&device_id=eq.${deviceId}&order=created_at.desc&limit=15`, {
      headers: { 'apikey': DB_CONFIG.anonKey, 'Authorization': `Bearer ${DB_CONFIG.anonKey}` }
    });
    const logs = await response.json();
    if (logs && logs.length > 0) {
      consoleEl.innerHTML = logs.reverse().map(l => {
        const time = new Date(l.created_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const prefix = l.type === 'danger' ? '[ERR]' : l.type === 'warn' ? '[WRN]' : l.type === 'success' ? '[OK ]' : '[INF]';
        return `<span style="opacity:0.5;">[${time}]</span> ${prefix} ${l.message}`;
      }).join('\n');
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  } catch (e) { console.warn('Console sync fail'); }
}

function showAddUserModal() {
  currentEditingUserId = null;
  const modal = document.getElementById('user-modal');
  if (modal) {
    modal.querySelector('.modal-title').textContent = 'Add User';
    modal.querySelector('.btn-primary').textContent = 'Create User';
  }
  document.getElementById('user-name').value = '';
  document.getElementById('user-email').value = '';
  document.getElementById('user-dept').value = '';
  if (document.getElementById('user-phone')) document.getElementById('user-phone').value = '';
  showModal('user-modal');
}

function showAddDeviceModal() {
  currentEditingDeviceId = null;
  const modal = document.getElementById('device-modal');
  if (modal) {
    modal.querySelector('.modal-title').textContent = 'Add Device';
    modal.querySelector('.btn-primary').textContent = 'Add Device';
  }
  document.getElementById('device-name').value = '';
  document.getElementById('device-id').value = '';
  document.getElementById('device-id').disabled = false;
  document.getElementById('device-id').style.opacity = '1';
  document.getElementById('device-location').value = '';
  document.getElementById('device-lat').value = '8.4542';
  document.getElementById('device-lng').value = '124.6319';
  showModal('device-modal');
}

async function saveUser() {
  const name = document.getElementById('user-name')?.value;
  const email = document.getElementById('user-email')?.value;
  const role = document.getElementById('user-role')?.value;
  const dept = document.getElementById('user-dept')?.value;
  const phone = document.getElementById('user-phone')?.value || '';
  const threshold = parseInt(document.getElementById('user-aqi-threshold')?.value) || 100;
  const smsEnabled = document.getElementById('user-sms-enabled')?.checked || false;
  if (!name || !email) { 
    showDashboardToast('error', 'Missing Information', 'Please fill in the name and email fields.');
    return; 
  }
  
  const action = currentEditingUserId ? 'Update' : 'Create';
  showConfirmModal(`${action} User`, `Are you sure you want to ${action.toLowerCase()} this user account for ${name}?`, async () => {
    try {
      const userData = { 
        name, email, role, dept, 
        status: 'active', 
        phone_number: phone,
        aqi_threshold: threshold,
        sms_enabled: smsEnabled
      };

      if (currentEditingUserId) {
        await Database.updateSystemUser(currentEditingUserId, userData);
        logRoleActivity('admin', 'info', `Updated user details for ${name} (${role})`, 'user');
        showDashboardToast('success', 'User Updated', `Account for ${name} has been updated successfully.`);
      } else {
        userData.user_id = `USR-${String(Date.now()).slice(-3)}${Math.floor(Math.random() * 10)}`; 
        await Database.createSystemUser(userData);
        logRoleActivity('admin', 'success', `Created new system user: ${name} as ${role}`, 'user');
        showDashboardToast('success', 'User Created', `New ${role} account for ${name} has been created.`);
      }

      closeModal('user-modal');
      await loadUsers();
      loadOverview();
    } catch (error) {
      console.error('Error saving user:', error);
      showDashboardToast('error', 'Save Failed', error.message);
    }
  }, 'success');
}

async function saveDevice() {
  const name = document.getElementById('device-name')?.value;
  const id = document.getElementById('device-id')?.value;
  const location = document.getElementById('device-location')?.value;
  const lat = parseFloat(document.getElementById('device-lat')?.value) || 8.4542;
  const lng = parseFloat(document.getElementById('device-lng')?.value) || 124.6319;
  
  if (!name || !id || !location) { 
    showDashboardToast('error', 'Missing Information', 'Please fill in all device details.');
    return; 
  }
  
  const action = currentEditingDeviceId ? 'Update' : 'Register';
  showConfirmModal(`${action} Device`, `Are you sure you want to ${action.toLowerCase()} device ${id}?`, async () => {
    try {
      const deviceData = { device_id: id, name, location, latitude: lat, longitude: lng, status: 'active' };
      
      if (currentEditingDeviceId) {
        const oldDev = devices.find(d => d.id === currentEditingDeviceId);
        const isLocChange = oldDev && (Math.abs(oldDev.lat - lat) > 0.0001 || Math.abs(oldDev.lng - lng) > 0.0001);
        
        await Database.updateDevice(currentEditingDeviceId, deviceData);
        
        if (isLocChange) {
          logRoleActivity('admin', 'warn', `Location changed for device ${id}: ${lat}, ${lng}`, 'location');
          showDashboardToast('info', 'Location Updated', `Device ${id} coordinates updated via Admin dashboard.`);
        } else {
          logRoleActivity('admin', 'info', `Updated device config for ${id}`, 'device');
          showDashboardToast('success', 'Device Updated', `Configuration for ${id} has been successfully updated.`);
        }
      } else {
        await Database.createDevice(deviceData);
        logRoleActivity('admin', 'success', `Registered new device: ${id} at ${location}`, 'device');
        showDashboardToast('success', 'Device Registered', `New device ${id} has been registered at ${location}.`);
      }

      closeModal('device-modal');
      await loadDevices();
      loadOverview();
    } catch (error) {
      console.error('Error saving device:', error);
      showDashboardToast('error', 'Save Failed', error.message);
    }
  }, 'success');
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



async function deleteDevice(deviceId) {
  showConfirmModal('Delete Device', `Are you sure you want to permanently delete device ${deviceId}? All associated history for this node will be unlinked.`, async () => {
    try {
      const dbDevices = await Database.getDevices();
      const dbDevice = dbDevices.find(d => d.device_id === deviceId);
      if (dbDevice) {
        const success = await Database.deleteDevice(dbDevice.id);
        if (!success) throw new Error('Failed to delete from database');
      }
      devices = devices.filter(d => d.id !== deviceId);
      logRoleActivity('admin', 'warn', `Permanently removed device ${deviceId} from system`, 'device');
      await loadDevices();
      loadOverview();
      showDashboardToast('success', 'Device Deleted', `Device ${deviceId} has been removed from the network.`);
    } catch (error) {
      console.error('Error deleting device:', error);
      showDashboardToast('error', 'Delete Failed', error.message);
    }
  });
}

function editUser(id) {
  const user = users.find(u => u.id === id);
  if (user) {
    currentEditingUserId = id;
    const modal = document.getElementById('user-modal');
    if (modal) {
      modal.querySelector('.modal-title').textContent = 'Edit User: ' + id;
      modal.querySelector('.btn-primary').textContent = 'Update User';
    }
    document.getElementById('user-name').value = user.name;
    document.getElementById('user-email').value = user.email;
    document.getElementById('user-role').value = user.role;
    document.getElementById('user-dept').value = user.dept;
    if (document.getElementById('user-phone')) document.getElementById('user-phone').value = user.phone || '';
    showModal('user-modal');
  }
}

function editDevice(id) {
  const device = devices.find(d => d.id === id);
  if (device) {
    currentEditingDeviceId = id;
    const modal = document.getElementById('device-modal');
    if (modal) {
      modal.querySelector('.modal-title').textContent = 'Edit Device: ' + id;
      modal.querySelector('.btn-primary').textContent = 'Update Device';
    }
    document.getElementById('device-name').value = device.name;
    document.getElementById('device-id').value = device.id;
    document.getElementById('device-id').disabled = true;
    document.getElementById('device-id').style.opacity = '0.6';
    document.getElementById('device-location').value = device.location;
    document.getElementById('device-lat').value = device.lat;
    document.getElementById('device-lng').value = device.lng;
    showModal('device-modal');
  }
}

function editDeviceFromDetail() {
  const deviceId = document.getElementById('dv-id')?.textContent;
  if (deviceId) {
    closeModal('device-detail-modal');
    editDevice(deviceId);
  }
}

async function deleteUser(userId) {
  showConfirmModal('Delete User', `Are you sure you want to revoke system access for user ${userId}? This action cannot be undone.`, async () => {
    try {
      const user = users.find(u => u.id === userId);
      if (!user) { showDashboardToast('error', 'Not Found', 'User record not found.'); return; }
      const dbUsers = await Database.getSystemUsers();
      const dbUser = dbUsers.find(u => u.user_id === userId);
      if (dbUser) {
        const success = await Database.deleteSystemUser(dbUser.id);
        if (!success) throw new Error('Failed to delete from database');
      }
      users = users.filter(u => u.id !== userId);
      logRoleActivity('admin', 'warn', `Revoked system access for user ${userId}`, 'user');
      await loadUsers();
      loadOverview();
      showDashboardToast('success', 'User Deleted', `Access for ${userId} has been successfully revoked.`);
    } catch (error) {
      console.error('Error deleting user:', error);
      showDashboardToast('error', 'Delete Failed', error.message);
    }
  });
}

function exportData() {
  systemActivity.unshift({ type: 'info', msg: 'Data export initiated', time: 'Just now' });
  logRoleActivity('management', 'info', 'Generated data export request');
  loadOverview();
}

function clearDatabase() {
  showConfirmModal('Clear Database', '⚠️ This will permanently delete ALL air quality readings from the database. This action is irreversible. Continue?', () => {
    Database.clearAllData().then(success => {
      if (success) {
        systemActivity.unshift({ type: 'warn', msg: 'Database cleared successfully', time: 'Just now' });
        logRoleActivity('admin', 'warn', 'Cleared all air quality records');
        showDashboardToast('success', 'Database Cleared', 'All sensor data has been purged from the system.');
      } else {
        systemActivity.unshift({ type: 'error', msg: 'Failed to clear database', time: 'Just now' });
        logRoleActivity('admin', 'error', 'Attempted database clear but failed');
        showDashboardToast('error', 'Purge Failed', 'System was unable to clear the sensor database.');
      }
      loadOverview();
    });
  }, 'danger');
}

function logout() {
  showConfirmModal('Logout', 'Are you sure you want to end your session?', () => {
    try {
      localStorage.removeItem('breathsafe_user');
    } catch (e) {}
    window.location.href = '../../index.html';
  }, 'danger');
}

async function checkAndTriggerSMSNotifications(currentAQI) {
  const autoSms = localStorage.getItem('auto_sms_enabled') === 'false' ? false : true;
  if (!autoSms) {
    console.log('🔇 Auto-SMS disabled by admin toggle. Skipping broadcast.');
    return;
  }
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
          logRoleActivity('system', 'warn', `Broadcast: ${level.toUpperCase()} alert queued for ${user.name} (${user.phone_number})`, 'sms');
        } else {
          console.log(`⏳ SMS cooldown active for ${user.name} - skipping`);
        }
      }
    }
  } catch (error) {
    console.error('Error checking SMS notifications:', error);
  }
}

async function checkStaleSMS() {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    // Fetch pending SMS created more than 5 minutes ago
    const response = await fetch(`${DB_CONFIG.url}/rest/v1/${DB_TABLES.smsNotifications}?status=eq.pending&created_at=lt.${fiveMinutesAgo}`, {
      headers: { 'apikey': DB_CONFIG.anonKey, 'Authorization': `Bearer ${DB_CONFIG.anonKey}` }
    });
    
    const staleSMS = await response.json();
    if (staleSMS && staleSMS.length > 0) {
      for (const sms of staleSMS) {
        // 1. Update status to failed in DB
        await fetch(`${DB_CONFIG.url}/rest/v1/${DB_TABLES.smsNotifications}?id=eq.${sms.id}`, {
          method: 'PATCH',
          headers: { 
            'apikey': DB_CONFIG.anonKey, 
            'Authorization': `Bearer ${DB_CONFIG.anonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            status: 'failed', 
            error_message: 'Gateway Timeout: GSM module failed to broadcast within 5 minutes' 
          })
        });

        // Only log activity and show toasts if the system is actually online
        // If we're already offline, we don't need to be told again that broadcasts are failing
        if (!window.isSystemOffline) {
          // 2. Log system alert
          logRoleActivity('system', 'danger', `Broadcast Failure: Awareness advisory to ${sms.phone_number} timed out. Gateway offline?`, 'sms');
          
          // 3. Show Toast for Admin Awareness
          showDashboardToast('error', 'Awareness Alert Failed', `The GSM gateway failed to send an advisory to ${sms.phone_number}. Please check hardware connectivity.`);
        }
      }
      
      // Refresh alerts list if we are on the alerts page
      if (document.body.dataset.page === 'alerts') {
        console.log('🔄 SMS Fallback: Refreshing Alert Page...');
        loadAlerts();
      }
    }
  } catch (error) {
    console.error('Error cleaning up stale SMS:', error);
  }
}

function initializeAdmin() {
  const page = document.body.dataset.page || 'overview';
  setActiveNav(page);
  renderCachedAlertBadge();
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
    console.log('🔄 Admin Dashboard: Refreshing ESP32 data...');
    const readings = await Database.fetchLatestReadings(1);
    
    if (readings && readings.length > 0) {
      const latest = readings[0];
      const lastSeenDate = new Date(latest.created_at);
      const now = new Date();
      const diffSeconds = (now - lastSeenDate) / 1000;
      
      const statusEl = document.getElementById('summary-status');
      const dataSourceEl = document.getElementById('summary-data-source');
      
      let wasOffline = window.isSystemOffline;
      // Faster Disconnect Detection: 90 seconds (3 missed packets)
      if (diffSeconds > 90) {
        if (statusEl) statusEl.innerHTML = `<span style="color:var(--red);">🔴 System Offline (Since ${lastSeenDate.toLocaleTimeString()})</span>`;
        if (dataSourceEl) dataSourceEl.textContent = `Last active: ${formatTimeAgo(latest.created_at)}`;
        window.isSystemOffline = true;
      } else {
        if (statusEl) statusEl.innerHTML = `<span style="color:var(--green);">🟢 System Online (Active)</span>`;
        if (dataSourceEl) dataSourceEl.textContent = `ESP32 ID: ${latest.device_id || 'AW-001'}`;
        window.isSystemOffline = false;
      }

      if (wasOffline !== window.isSystemOffline) {
        const devId = latest.device_id || 'AW-001';
        const stateMsg = window.isSystemOffline ? `CRITICAL: ESP32 Gateway (${devId}) Disconnected` : `System Restored: ESP32 Gateway (${devId}) Online`;
        const stateType = window.isSystemOffline ? 'danger' : 'success';
        const statusVal = window.isSystemOffline ? 'offline' : 'online';
        
        systemActivity.unshift({ type: stateType, msg: stateMsg, time: new Date().toLocaleTimeString() });
        logRoleActivity('system', stateType, stateMsg, 'hardware');
        
        // Persist status change to Database
        Database.updateDeviceStatus(devId, statusVal);
        
        if (window.isSystemOffline) {
          showDashboardToast('error', 'Connectivity Lost', `The campus air quality sensor (${devId}) has gone offline. Alerts are suppressed until connection is restored.`);
        } else {
          showDashboardToast('success', 'Connection Restored', `Sensor link established for ${devId}. Real-time monitoring resumed.`);
        }
      }

      devices[0] = { ...devices[0], aqi: latest.aqi_value || 0, temp: latest.temperature || 0, hum: latest.humidity || 0, lastSeen: formatTimeAgo(latest.created_at), lastReadingTime: latest.created_at };
      
      systemActivity.unshift({ type: 'info', msg: `Background sync: Database polling successful`, time: new Date().toLocaleTimeString() });
      if (systemActivity.length > 10) systemActivity.pop();
      
      if (document.body.dataset.page === 'overview') {
        loadOverview();
      }
      if (document.body.dataset.page === 'reports') loadReports();
      if (document.getElementById('summary-last-update')) document.getElementById('summary-last-update').textContent = new Date().toLocaleTimeString();
      
      // Only trigger alerts and toasts if the system is currently online (fresh data)
      if (!window.isSystemOffline) {
        await checkAndTriggerSMSNotifications(devices[0].aqi);
        
        const currentLevel = getAlertLevel(devices[0]);
        if (currentLevel !== lastToastAlertLevel) {
          const toastTemplate = buildAlertContent(currentLevel, devices[0]);
          if (currentLevel !== 'normal') showDashboardToast(toastTemplate.toastType, toastTemplate.toastTitle, toastTemplate.toastMessage);
          lastToastAlertLevel = currentLevel;
        }
      } else {
        console.log('🔇 System Offline: Alert and Toast suppression active.');
      }
      
      await checkStaleSMS();

      // Background badge refresh for all pages
      try {
        const dbActivity = await Database.fetchActivity(BADGE_FETCH_LIMIT);
        const dbAlerts = (dbActivity || []).map(a => ({ type: a.type, created_at: a.created_at }));
        updateAlertBadge([...dbAlerts, ...getHardwareAlerts()]);
      } catch (e) { /* silent fail */ }
    } else {
      console.warn('⚠️ No database connection, generating offline data');
      const offlineData = generateOfflineData();
      if (offlineData && offlineData.length > 0) {
        const latest = offlineData[0];
        devices[0] = { ...devices[0], aqi: latest.aqi_value || 0, temp: latest.temperature || 0, hum: latest.humidity || 0, co2: Math.round((latest.mq135_raw || 0) * 0.12), battery: 85 + Math.random() * 15, lastSeen: 'Offline Mode', lastReadingTime: latest.created_at };
        const summaryDataSource = document.getElementById('summary-data-source');
        const summaryStatus = document.getElementById('summary-status');
        if (summaryDataSource) summaryDataSource.textContent = 'Offline (Generated)';
        if (summaryStatus) { summaryStatus.textContent = '🟡 Offline Mode'; summaryStatus.style.color = 'var(--yellow)'; }
        if (document.getElementById('summary-last-update')) document.getElementById('summary-last-update').textContent = new Date().toLocaleTimeString();
        if (document.body.dataset.page === 'overview') loadOverview();
      }
      // Refresh badge with hardware-only alerts when offline
      updateAlertBadge(getHardwareAlerts());
    }
  }, 30000);
}

document.addEventListener('DOMContentLoaded', initializeAdmin);
