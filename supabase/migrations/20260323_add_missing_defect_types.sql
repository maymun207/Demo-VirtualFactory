-- Add 13 missing defect_type enum values to match the TypeScript DefectType union
-- These are used by causeEffectConfig.ts and the simulation's defect engine
-- Fixes: SyncService snapshots upsert failed: invalid input value for enum defect_type: "glaze_peel"

ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'conveyor_jam_damage';
ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'surface_defect';
ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'mold_sticking';
ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'lamination';
ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'moisture_variance';
ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'glaze_peel';
ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'banding';
ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'pattern_distortion';
ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'missed_defect';
ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'false_pass';
ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'warp_pass';
ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'mislabel';
ALTER TYPE defect_type ADD VALUE IF NOT EXISTS 'customer_complaint';
