-- KPI設定（目標値からの逆算プラン）の永続化
CREATE TABLE `kpi_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`data_source_id` text NOT NULL,
	`target_column` text NOT NULL,
	`period_label` text NOT NULL,
	`period_type` text NOT NULL DEFAULT 'custom',
	`plan_json` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	`updated_at` integer NOT NULL DEFAULT (unixepoch())
);
