// ═══════════════════════════════════════════
// DATABASE CONFIGURATION
// ═══════════════════════════════════════════
const CONFIG = {
  // Supabase Database Configuration
  database: {
    url: 'https://hqptxgzpzuhsrybuyjoy.supabase.co',
    anonKey: 'sb_publishable_Vn85SyMOd3cToHzCliO5Jg_AX2BO_xY',
    table: 'air_quality_readings',
    // Refresh interval in milliseconds (30 seconds)
    refreshInterval: 30000,
    // Number of latest readings to fetch
    fetchLimit: 10
  },
  tables: {
    readings: 'air_quality_readings',
    devices: 'devices',
    notificationUsers: 'notification_users',
    smsNotifications: 'sms_notifications',
    systemUsers: 'system_users',
    hourlyStats: 'hourly_stats'
  },
  
  // Arduino Device Configuration
  devices: [
    { id:'AW-001', name:'Air Quality Monitor', location:'Your Location', lat:8.4542, lng:124.6319 }
  ],
  
  // AQI Thresholds
  thresholds: {
    good: 50,
    moderate: 100,
    unhealthy: 150,
    veryUnhealthy: 200
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else {
  window.CONFIG = CONFIG;
}
