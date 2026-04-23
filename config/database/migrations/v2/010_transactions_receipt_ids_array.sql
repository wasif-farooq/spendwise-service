-- Change receipt_id to receipt_ids array for multiple file uploads

ALTER TABLE transactions DROP COLUMN IF EXISTS receipt_id;
ALTER TABLE transactions ADD COLUMN receipt_ids UUID[] DEFAULT '{}';