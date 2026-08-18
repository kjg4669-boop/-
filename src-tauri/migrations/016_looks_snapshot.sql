-- Add subtitle and background style snapshots to looks
ALTER TABLE looks ADD COLUMN subtitle_snapshot TEXT;
ALTER TABLE looks ADD COLUMN background_snapshot TEXT;
