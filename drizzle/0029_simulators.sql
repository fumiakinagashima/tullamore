-- シミュレーター（回帰モデル）の永続化
CREATE TABLE `simulators` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`data_source_id` text NOT NULL,
	`method` text NOT NULL DEFAULT 'linear_regression',
	`target_column` text NOT NULL,
	`feature_columns` text NOT NULL DEFAULT '[]',
	`model_json` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	`updated_at` integer NOT NULL DEFAULT (unixepoch())
);
