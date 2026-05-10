-- ============================================================
--  SUPABASE DATABASE SETUP — Air Quality Monitor
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Create the main readings table
CREATE TABLE IF NOT EXISTS air_quality_readings (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_id     TEXT DEFAULT 'AW-001',
  latitude      NUMERIC(10, 7),
  longitude     NUMERIC(10, 7),
  temperature   NUMERIC(5,2),       -- °C
  humidity      NUMERIC(5,2),       -- %
  mq135_raw     INTEGER,            -- raw ADC 0–4095
  aqi_value     INTEGER,            -- mapped 0–500
  aqi_category  TEXT CHECK (aqi_category IN ('Good', 'Moderate', 'Unhealthy')),
  co2_ppm       NUMERIC(10,2),
  nh3_ppm       NUMERIC(10,2),
  benzene_ppm   NUMERIC(10,2),
  alcohol_ppm   NUMERIC(10,2)
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

-- 9. SMS notification log (REFINED)
CREATE TABLE IF NOT EXISTS public.sms_notifications (
  id            BIGSERIAL NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  user_id       BIGINT NULL,
  phone_number  TEXT NOT NULL,
  message       TEXT NOT NULL,
  aqi_value     INTEGER NULL,
  status        TEXT NULL DEFAULT 'pending'::TEXT,
  error_message TEXT NULL,
  CONSTRAINT sms_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT sms_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES notification_users (id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_sms_notifications_status ON public.sms_notifications USING btree (status) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_sms_notifications_created ON public.sms_notifications USING btree (created_at DESC) TABLESPACE pg_default;

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

-- 16. Add name column if missing (for tables created before this column was added)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Unnamed Device';

-- 17. Insert default device
INSERT INTO devices (device_id, name, location, latitude, longitude)
VALUES ('AW-001', 'BreathSafe Main Station', 'Your Location', 8.4542, 124.6319)
ON CONFLICT (device_id) DO NOTHING;

-- 17. System users table for admin dashboard login
CREATE TABLE IF NOT EXISTS system_users (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id       TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT CHECK (role IN ('admin', 'management', 'viewer')) DEFAULT 'viewer',
  dept          TEXT DEFAULT 'General',
  status        TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  phone_number  TEXT,
  password      TEXT NOT NULL DEFAULT 'admin123',
  last_login    TIMESTAMPTZ
);

-- 18. Indexes for system_users
CREATE INDEX IF NOT EXISTS idx_system_users_email
  ON system_users(email);
CREATE INDEX IF NOT EXISTS idx_system_users_status
  ON system_users(status);

-- 19. Enable RLS on system_users
ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;

-- 20. RLS Policies for system_users
CREATE POLICY "allow_anon_select_system_users"
  ON system_users
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "allow_anon_insert_system_users"
  ON system_users
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "allow_anon_update_system_users"
  ON system_users
  FOR UPDATE
  TO anon
  USING (true);

CREATE POLICY "allow_anon_delete_system_users"
  ON system_users
  FOR DELETE
  TO anon
  USING (true);

-- 21. Insert default admin user
INSERT INTO system_users (user_id, name, email, role, dept, status, password)
VALUES ('USR-001', 'Admin User', 'admin@breathsafe.com', 'admin', 'System', 'active', 'admin123')
ON CONFLICT (email) DO NOTHING;

-- 22. In-App Notifications table (for internal alerting)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL, -- References auth.users or a custom users table
  alert_id        UUID NULL,
  title           CHARACTER VARYING(255) NOT NULL,
  message         TEXT NOT NULL,
  notification_type CHARACTER VARYING(20) NULL DEFAULT 'info'::CHARACTER VARYING,
  is_read         BOOLEAN NULL DEFAULT FALSE,
  created_at      TIMESTAMP WITH TIME ZONE NULL DEFAULT CURRENT_TIMESTAMP,
  read_at         TIMESTAMP WITH TIME ZONE NULL,
  CONSTRAINT notifications_pkey PRIMARY KEY (notification_id),
  CONSTRAINT notifications_notification_type_check CHECK (
    (notification_type)::TEXT = ANY (
      ARRAY['info', 'warning', 'error', 'success']::TEXT[]
    )
  )
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications USING btree (created_at DESC) TABLESPACE pg_default;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_anon_all_notifications" ON public.notifications FOR ALL TO anon USING (true) WITH CHECK (true);

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

-- ============================================================
--  SYSTEM ACTIVITY & REAL-TIME ALERTS
-- ============================================================

CREATE TABLE IF NOT EXISTS system_activity (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type          TEXT NOT NULL, -- info, success, warn, danger
  category      TEXT NOT NULL, -- device, user, location, security
  message       TEXT NOT NULL,
  actor         TEXT,          -- Name of the user/role
  device_id     TEXT           -- Optional device reference
);

ALTER TABLE system_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_select_activity"
  ON system_activity FOR SELECT TO anon USING (true);

CREATE POLICY "allow_anon_insert_activity"
  ON system_activity FOR INSERT TO anon WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_activity_created_at
  ON system_activity (created_at DESC);

-- ============================================================
--  MAINTENANCE LOGS TABLE
--  Stores device maintenance records logged by management
-- ============================================================

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_id     TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN (
                  'inspection', 'sensor_replacement', 'calibration',
                  'cleaning', 'firmware_update', 'repair', 'other'
                )),
  components    TEXT[] DEFAULT '{}',   -- e.g. ARRAY['ESP32','DHT11']
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'resolved' CHECK (status IN (
                  'resolved', 'ongoing', 'monitoring'
                )),
  performed_by  TEXT DEFAULT 'Manager'
);

-- Index for fast per-device lookups
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_device_id
  ON maintenance_logs (device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_created_at
  ON maintenance_logs (created_at DESC);

-- Enable RLS
ALTER TABLE maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_select_maintenance"
  ON maintenance_logs FOR SELECT TO anon USING (true);

CREATE POLICY "allow_anon_insert_maintenance"
  ON maintenance_logs FOR INSERT TO anon WITH CHECK (true);
