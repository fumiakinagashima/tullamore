-- Date column + FROM/TO for scoping the target period of KPI achievement-rate tracking (existing plans stay NULL, i.e. unscoped, and target the full history)
ALTER TABLE `kpi_plans` ADD `date_column` text;
ALTER TABLE `kpi_plans` ADD `period_from` text;
ALTER TABLE `kpi_plans` ADD `period_to` text;
