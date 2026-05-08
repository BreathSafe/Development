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
