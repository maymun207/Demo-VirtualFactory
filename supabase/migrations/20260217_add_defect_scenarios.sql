-- ============================================================================
-- MIGRATION: Enhance defect_scenarios + scenario_activations + seed 4 scenarios
-- Applied to Supabase project: ukhattgmidhchanzvevt on 2026-02-17
-- ============================================================================

-- 1. Add bilingual name/description columns to defect_scenarios
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'defect_scenarios' AND column_name = 'name_tr') THEN
    ALTER TABLE defect_scenarios ADD COLUMN name_tr TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'defect_scenarios' AND column_name = 'name_en') THEN
    ALTER TABLE defect_scenarios ADD COLUMN name_en TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'defect_scenarios' AND column_name = 'description_tr') THEN
    ALTER TABLE defect_scenarios ADD COLUMN description_tr TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'defect_scenarios' AND column_name = 'description_en') THEN
    ALTER TABLE defect_scenarios ADD COLUMN description_en TEXT;
  END IF;
END $$;

-- 2. Add JSONB data columns to defect_scenarios
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'defect_scenarios' AND column_name = 'parameter_overrides') THEN
    ALTER TABLE defect_scenarios ADD COLUMN parameter_overrides JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'defect_scenarios' AND column_name = 'expected_defects') THEN
    ALTER TABLE defect_scenarios ADD COLUMN expected_defects JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'defect_scenarios' AND column_name = 'expected_scrap_range') THEN
    ALTER TABLE defect_scenarios ADD COLUMN expected_scrap_range JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'defect_scenarios' AND column_name = 'expected_oee_range') THEN
    ALTER TABLE defect_scenarios ADD COLUMN expected_oee_range JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'defect_scenarios' AND column_name = 'expected_energy_impact') THEN
    ALTER TABLE defect_scenarios ADD COLUMN expected_energy_impact JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'defect_scenarios' AND column_name = 'cause_effect_table') THEN
    ALTER TABLE defect_scenarios ADD COLUMN cause_effect_table JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'defect_scenarios' AND column_name = 'updated_at') THEN
    ALTER TABLE defect_scenarios ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- 3. Add scenario_code and is_active to scenario_activations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scenario_activations' AND column_name = 'scenario_code') THEN
    ALTER TABLE scenario_activations ADD COLUMN scenario_code TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scenario_activations' AND column_name = 'is_active') THEN
    ALTER TABLE scenario_activations ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_scenario_activations_simulation ON scenario_activations(simulation_id);
CREATE INDEX IF NOT EXISTS idx_scenario_activations_active ON scenario_activations(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_parameter_changes_scenario ON parameter_change_events(scenario_id) WHERE scenario_id IS NOT NULL;

-- 5. Seed 4 scenarios
INSERT INTO defect_scenarios (
  code, name, name_tr, name_en, description, description_tr, description_en,
  severity, trigger_conditions,
  parameter_overrides, expected_defects, expected_scrap_range,
  expected_oee_range, expected_energy_impact, cause_effect_table
)
VALUES
  ('SCN-001', 'Optimal Production', 'Optimal Üretim', 'Optimal Production',
   'All parameters within optimal ranges.',
   'Tüm parametreler optimal aralıklarda. İdeal üretim koşullarını temsil eder.',
   'All parameters within optimal ranges. Represents ideal production conditions.',
   'low', '{}'::jsonb,
   '[]'::jsonb, '[]'::jsonb,
   '{"min": 3, "max": 5}'::jsonb,
   '{"min": 85, "max": 92}'::jsonb,
   '{"min": 0, "max": 0}'::jsonb,
   '[]'::jsonb),

  ('SCN-002', 'Kiln Temperature Crisis', 'Fırın Sıcaklık Krizi', 'Kiln Temperature Crisis',
   'Kiln Zone-5 temperature deviates +18-25C above setpoint.',
   'Fırın Zon-5 sıcaklığı ayar noktasının +18-25C üzerine çıkıyor. Soğutma gradyanı çok agresif.',
   'Kiln Zone-5 temperature deviates +18-25C above setpoint. Cooling gradient too aggressive.',
   'critical', '{"kiln_zone5_temp_deviation": "+18-25C"}'::jsonb,
   '[]'::jsonb, '[]'::jsonb,
   '{"min": 25, "max": 35}'::jsonb,
   '{"min": 55, "max": 65}'::jsonb,
   '{"min": 15, "max": 20}'::jsonb,
   '[]'::jsonb),

  ('SCN-003', 'Glaze Viscosity Drift', 'Sır Viskozite Kayması', 'Glaze Viscosity Drift',
   'Glaze slurry viscosity drops below spec.',
   'Sır bulamacı viskozitesi spek altına düşer. Nozüller kısmen tıkanır.',
   'Glaze slurry viscosity drops below spec. Nozzles partially clog.',
   'high', '{"glaze_viscosity": "below_spec"}'::jsonb,
   '[]'::jsonb, '[]'::jsonb,
   '{"min": 18, "max": 25}'::jsonb,
   '{"min": 65, "max": 72}'::jsonb,
   '{"min": 8, "max": 10}'::jsonb,
   '[]'::jsonb),

  ('SCN-004', 'Multi-Station Cascade Failure', 'Çoklu İstasyon Kaskad Arızası', 'Multi-Station Cascade Failure',
   'Simultaneous failures across multiple stations.',
   'Eş zamanlı arızalar: Pres kalıbı aşınmış, kurutma fanı düşmüş, sır nozülleri tıkalı.',
   'Simultaneous failures: worn press mold, dryer fan drop, clogged glaze nozzles.',
   'critical', '{"press_mold": "worn", "dryer_fan": "degraded", "glaze_nozzle": "clogged"}'::jsonb,
   '[]'::jsonb, '[]'::jsonb,
   '{"min": 40, "max": 55}'::jsonb,
   '{"min": 30, "max": 45}'::jsonb,
   '{"min": 25, "max": 35}'::jsonb,
   '[]'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  name_tr = EXCLUDED.name_tr,
  name_en = EXCLUDED.name_en,
  description_tr = EXCLUDED.description_tr,
  description_en = EXCLUDED.description_en,
  severity = EXCLUDED.severity,
  parameter_overrides = EXCLUDED.parameter_overrides,
  expected_defects = EXCLUDED.expected_defects,
  expected_scrap_range = EXCLUDED.expected_scrap_range,
  expected_oee_range = EXCLUDED.expected_oee_range,
  expected_energy_impact = EXCLUDED.expected_energy_impact,
  cause_effect_table = EXCLUDED.cause_effect_table,
  trigger_conditions = EXCLUDED.trigger_conditions,
  updated_at = now();
