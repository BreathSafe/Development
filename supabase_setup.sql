-- ============================================================
--  SUPABASE DATABASE SETUP — Air Quality Monitor
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Create the main readings table
CREATE TABLE IF NOT EXISTS air_quality_readings (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  temperature   NUMERIC(5,2),       -- °C
  humidity      NUMERIC(5,2),       -- %
  mq135_raw     INTEGER,            -- raw ADC 0–4095
  aqi_value     INTEGER,            -- mapped 0–500
  aqi_category  TEXT CHECK (aqi_category IN ('Good', 'Moderate', 'Unhealthy'))
);

-- 2. Index on created_at for fast time-range queries
CREATE INDEX IF NOT EXISTS idx_aqr_created_at
  ON air_quality_readings (created_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE air_quality_readings ENABLE ROW LEVEL SECURITY;

-- 4a. Allow anonymous INSERT (ESP32 uses anon key)
CREATE POLICY "allow_anon_insert"
  ON air_quality_readings
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 4b. Allow anonymous SELECT (dashboard reads with anon key)
CREATE POLICY "allow_anon_select"
  ON air_quality_readings
  FOR SELECT
  TO anon
  USING (true);

-- 5. Auto-delete rows older than 30 days to keep DB lean
--    (optional — remove if you want full history)
CREATE OR REPLACE FUNCTION delete_old_readings()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM air_quality_readings
  WHERE created_at < NOW() - INTERVAL '30 days';
$$;

-- Schedule the cleanup daily using pg_cron (enable in Supabase → Extensions)
-- SELECT cron.schedule('daily-cleanup', '0 0 * * *', 'SELECT delete_old_readings()');

-- 6. Convenience view: last 100 readings
CREATE OR REPLACE VIEW latest_readings AS
SELECT *
FROM air_quality_readings
ORDER BY created_at DESC
LIMIT 100;

-- 7. Aggregated hourly stats view (useful for charts)
CREATE OR REPLACE VIEW hourly_stats AS
SELECT
  DATE_TRUNC('hour', created_at)  AS hour,
  ROUND(AVG(temperature)::NUMERIC, 2)  AS avg_temp,
  ROUND(AVG(humidity)::NUMERIC, 2)     AS avg_humidity,
  ROUND(AVG(aqi_value)::NUMERIC, 0)    AS avg_aqi,
  MAX(aqi_value)                        AS max_aqi,
  COUNT(*)                              AS reading_count
FROM air_quality_readings
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- ============================================================
--  USER MANAGEMENT & SMS NOTIFICATION TABLES
-- ============================================================

-- 8. Users table for SMS notification registration
CREATE TABLE IF NOT EXISTS notification_users (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name          TEXT NOT NULL,
  phone_number  TEXT NOT NULL UNIQUE,  -- Format: +63XXXXXXXXXX
  email         TEXT,
  device_id     TEXT DEFAULT 'AW-001', -- Which device to monitor
  aqi_threshold INTEGER DEFAULT 100,    -- Alert when AQI exceeds this
  is_active     BOOLEAN DEFAULT TRUE,
  last_alert    TIMESTAMPTZ
);

-- 9. SMS notification log
CREATE TABLE IF NOT EXISTS sms_notifications (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id       BIGINT REFERENCES notification_users(id),
  phone_number  TEXT NOT NULL,
  message       TEXT NOT NULL,
  aqi_value     INTEGER,
  status        TEXT DEFAULT 'pending', -- pending, sent, failed
  error_message TEXT
);

-- 10. Device management table
CREATE TABLE IF NOT EXISTS devices (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_id     TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  location      TEXT,
  latitude      NUMERIC(10, 7),
  longitude     NUMERIC(10, 7),
  status        TEXT DEFAULT 'active',
  last_seen     TIMESTAMPTZ,
  phone_number  TEXT  -- For SIM900 on this device
);

-- 11. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_users_phone
  ON notification_users(phone_number);
CREATE INDEX IF NOT EXISTS idx_notification_users_active
  ON notification_users(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_sms_notifications_status
  ON sms_notifications(status);
CREATE INDEX IF NOT EXISTS idx_sms_notifications_created
  ON sms_notifications(created_at DESC);

-- 12. Enable RLS on new tables
ALTER TABLE notification_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- 13. RLS Policies for notification_users
CREATE POLICY "allow_anon_select_users"
  ON notification_users
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "allow_anon_insert_users"
  ON notification_users
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "allow_anon_update_users"
  ON notification_users
  FOR UPDATE
  TO anon
  USING (true);

-- 14. RLS Policies for sms_notifications
CREATE POLICY "allow_anon_select_sms"
  ON sms_notifications
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "allow_anon_insert_sms"
  ON sms_notifications
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 15. RLS Policies for devices
CREATE POLICY "allow_anon_select_devices"
  ON devices
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "allow_anon_insert_devices"
  ON devices
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 16. Insert default device
INSERT INTO devices (device_id, name, location, latitude, longitude)
VALUES ('AW-001', 'AirWatch Main Station', 'Your Location', 8.4542, 124.6319)
ON CONFLICT (device_id) DO NOTHING;

-- ============================================================
--  HOW TO GET YOUR CREDENTIALS (for the Arduino sketch)
-- ============================================================
--  1. SUPABASE_URL   → Settings → API → "Project URL"
--     e.g. https://abcdefgh.supabase.co
--
--  2. SUPABASE_APIKEY → Settings → API → "anon public" key
--     (safe to use on device — RLS policies protect the data)
-- ============================================================
--  QUICK TEST — paste in SQL Editor after uploading a reading:
-- ============================================================
--  SELECT * FROM latest_readings LIMIT 10;
