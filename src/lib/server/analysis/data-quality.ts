import type { ValidityAssessment } from '$lib/analysis/validity';
import { continuousColumns } from '$lib/analysis/column-type';
import { computeDescriptiveStatsFromDataSource } from './descriptive-stats';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';
import { DESCRIPTIVE_STATS_SAMPLE_MAX_ROWS, DESCRIPTIVE_STATS_HISTOGRAM_BINS } from '$lib/constants';

export type ColumnQuality = {
	key: string;
	label: string;
	n: number;
	missingCount: number;
	outlierCount: number;
	validity: ValidityAssessment;
};

export type DataQualityReport = {
	rowCount: number;
	lowRowCountWarning: boolean;
	columns: ColumnQuality[];
};

/**
 * データソースの数値列ごとに欠損件数・外れ値候補・妥当性チェックを算出する
 * （既存の記述統計エンジンをそのまま再利用。列ごとに独立して呼び出すことで、
 * 1列が全件NULL等で計算不能でも他の列の結果まで巻き込んで失敗しないようにする）。
 */
export async function computeDataQuality(db: D1Database, dataSource: DataSource): Promise<DataQualityReport> {
	const schemaColumns = parseSchema(dataSource.schemaJson);
	const numericColumns = continuousColumns(schemaColumns);

	const columns: ColumnQuality[] = [];
	for (const col of numericColumns) {
		try {
			const stats = await computeDescriptiveStatsFromDataSource(
				db,
				dataSource,
				[col.key],
				DESCRIPTIVE_STATS_SAMPLE_MAX_ROWS,
				DESCRIPTIVE_STATS_HISTOGRAM_BINS
			);
			const s = stats[col.key];
			columns.push({
				key: col.key,
				label: col.label,
				n: s.n,
				missingCount: Math.max(0, dataSource.rowCount - s.n),
				outlierCount: s.outlierCount,
				validity: s.validity
			});
		} catch {
			columns.push({
				key: col.key,
				label: col.label,
				n: 0,
				missingCount: dataSource.rowCount,
				outlierCount: 0,
				validity: { overallLevel: 'poor', overallComment: 'この列には値のあるデータがありません', checks: [] }
			});
		}
	}

	return { rowCount: dataSource.rowCount, lowRowCountWarning: dataSource.rowCount < 30, columns };
}
