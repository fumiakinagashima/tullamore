-- Queueベースの大規模テーブル継続取り込み向けに、再開位置を保持する列を追加する
ALTER TABLE `external_table_syncs` ADD `last_sync_offset` integer DEFAULT 0 NOT NULL;
