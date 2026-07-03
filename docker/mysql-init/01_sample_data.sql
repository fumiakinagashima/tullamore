-- ローカル開発用のサンプルテーブル。/connections の取り込みフローを
-- 実際のMySQLに対してエンドツーエンドで確認するためのもの（本番データではない）。
CREATE TABLE IF NOT EXISTS external_sales (
	id INT AUTO_INCREMENT PRIMARY KEY,
	sale_month DATE NOT NULL,
	ad_spend DECIMAL(10, 1) NOT NULL,
	visitors INT NOT NULL,
	avg_temp DECIMAL(4, 1) NOT NULL,
	sales DECIMAL(10, 1) NOT NULL
);

INSERT INTO external_sales (sale_month, ad_spend, visitors, avg_temp, sales) VALUES
	('2024-01-01', 20.1, 905, 6.2, 464.8),
	('2024-02-01', 20.8, 927, 8.5, 483.9),
	('2024-03-01', 21.5, 963, 12.0, 522.4),
	('2024-04-01', 22.0, 1004, 17.1, 559.7),
	('2024-05-01', 22.8, 1041, 21.8, 596.2),
	('2024-06-01', 23.4, 1082, 25.0, 623.9),
	('2024-07-01', 24.0, 1118, 28.9, 660.5),
	('2024-08-01', 24.7, 1156, 29.2, 687.0),
	('2024-09-01', 25.3, 1189, 25.6, 700.4),
	('2024-10-01', 26.0, 1224, 19.0, 715.8),
	('2024-11-01', 26.6, 1258, 13.0, 731.9),
	('2024-12-01', 27.2, 1296, 7.8, 750.6);
