-- ============================================================
-- Logistics Mind — MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS smart_logistics
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_logistics;

CREATE TABLE IF NOT EXISTS decisions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  shipment_type   VARCHAR(50)   NOT NULL,
  weight          DECIMAL(10,2) NOT NULL,
  origin          VARCHAR(100)  NOT NULL,
  destination     VARCHAR(100)  NOT NULL,
  delivery_date   DATE          NOT NULL,
  budget          DECIMAL(10,2) DEFAULT NULL,
  shipping_method VARCHAR(100)  NOT NULL,
  selected_route  VARCHAR(50)   NOT NULL,
  distance_km     DECIMAL(10,2) NOT NULL,
  duration_hr     DECIMAL(10,2) NOT NULL,
  cost_level      VARCHAR(20)   NOT NULL,
  traffic_level   VARCHAR(20)   NOT NULL,
  risk_level      VARCHAR(20)   NOT NULL,
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- SELECT all records (used by GET /api/decisions)
-- SELECT * FROM decisions ORDER BY created_at DESC LIMIT 100;

-- INSERT example (used by POST /api/decisions)
-- INSERT INTO decisions
--   (shipment_type, weight, origin, destination, delivery_date, budget,
--    shipping_method, selected_route, distance_km, duration_hr,
--    cost_level, traffic_level, risk_level)
-- VALUES
--   ('normal', 150.00, 'Riyadh', 'Jeddah', '2026-05-01', 300.00,
--    'Land Transport', 'Route A', 950.00, 9.50, 'High', 'Medium', 'Low');