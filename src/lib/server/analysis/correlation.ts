import type { CorrelationMatrix } from '$lib/analysis/correlation-matrix';
import { buildCorrelationMatrix } from '$lib/analysis/correlation-matrix';
import { continuousColumns } from '$lib/analysis/column-type';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';
import { computeSufficientStats } from './sufficient-stats';

/**
 * columns[0] を「目的変数」としてSQL集計（computeSufficientStats）を1回呼ぶだけで、
 * 全列ペアの相関行列を求める（相関行列専用の新たなSQL集計は不要）。
 */
export async function computeCorrelationMatrixFromDataSource(
	db: D1Database,
	dataSource: DataSource,
	columns: string[]
): Promise<CorrelationMatrix> {
	if (columns.length < 2) {
		throw new Error('相関を計算するには2列以上を選択してください');
	}
	const schemaColumns = parseSchema(dataSource.schemaJson);
	const usable = new Set(continuousColumns(schemaColumns).map((c) => c.key));
	const invalid = columns.filter((c) => !usable.has(c));
	if (invalid.length > 0) {
		throw new Error(`数値列でないものが含まれています: ${invalid.join(', ')}`);
	}

	const stats = await computeSufficientStats(db, dataSource.tableName, columns[0], columns.slice(1));
	return buildCorrelationMatrix(stats, columns);
}
