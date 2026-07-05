-- KPI達成率トラッキングの対象期間を絞り込むための日時カラム＋FROM/TO（既存プランはNULL＝期間未指定のまま全期間を対象とする）
ALTER TABLE `kpi_plans` ADD `date_column` text;
ALTER TABLE `kpi_plans` ADD `period_from` text;
ALTER TABLE `kpi_plans` ADD `period_to` text;
