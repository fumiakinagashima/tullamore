-- CRM固有テーブルを削除
DROP TABLE IF EXISTS `activities`;
DROP TABLE IF EXISTS `deals`;
DROP TABLE IF EXISTS `contacts`;
DROP TABLE IF EXISTS `customers`;
DROP TABLE IF EXISTS `core_custom_fields`;

-- BIデータソースカタログテーブル
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`table_name` text NOT NULL,
	`schema_json` text NOT NULL DEFAULT '[]',
	`row_count` integer NOT NULL DEFAULT 0,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	`updated_at` integer NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX `data_sources_table_name_unique` ON `data_sources` (`table_name`);
