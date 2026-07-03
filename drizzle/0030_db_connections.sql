CREATE TABLE `db_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`provider` text DEFAULT 'hyperdrive' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);

CREATE TABLE `external_table_syncs` (
	`id` text PRIMARY KEY NOT NULL,
	`db_connection_id` text NOT NULL,
	`data_source_id` text NOT NULL,
	`external_schema` text NOT NULL,
	`external_table` text NOT NULL,
	`column_mapping` text DEFAULT '{}' NOT NULL,
	`last_sync_status` text,
	`last_sync_error` text,
	`last_sync_row_count` integer DEFAULT 0 NOT NULL,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
