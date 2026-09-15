-- Add a column that tracks the resume position, for queue-based continued ingestion of large tables
ALTER TABLE `external_table_syncs` ADD `last_sync_offset` integer DEFAULT 0 NOT NULL;
