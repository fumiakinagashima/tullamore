-- Delete notifications with account_id IS NULL (legacy data from before login was implemented), then add the NOT NULL constraint
-- SQLite does not support ALTER COLUMN, so we work around it by recreating the table
DELETE FROM notifications WHERE account_id IS NULL;
CREATE TABLE `notifications_new` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'generic' NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`seed_content` text DEFAULT '[]' NOT NULL,
	`account_id` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
INSERT INTO `notifications_new` SELECT * FROM `notifications`;
DROP TABLE `notifications`;
ALTER TABLE `notifications_new` RENAME TO `notifications`;
