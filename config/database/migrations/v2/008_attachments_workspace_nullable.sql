-- Make workspace_id nullable in attachments for user-specific uploads
ALTER TABLE attachments ALTER COLUMN workspace_id DROP NOT NULL;