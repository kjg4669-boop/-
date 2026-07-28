-- Add notes column to services for persistent operator memos
ALTER TABLE services ADD COLUMN notes TEXT NOT NULL DEFAULT '';
