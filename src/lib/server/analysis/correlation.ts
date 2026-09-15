import type { CorrelationMatrix } from '$lib/analysis/correlation-matrix';
import { buildCorrelationMatrix } from '$lib/analysis/correlation-matrix';
import { continuousColumns } from '$lib/analysis/column-type';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';
import { computeSufficientStats } from './sufficient-stats';

/**
 * Computes the correlation matrix for all column pairs by calling the SQL aggregation
 * (computeSufficientStats) just once, treating columns[0] as the "target variable"
 * (no separate SQL aggregation dedicated to the correlation matrix is needed).
 */
export async function computeCorrelationMatrixFromDataSource(
	db: D1Database,
	dataSource: DataSource,
	columns: string[]
): Promise<CorrelationMatrix> {
	if (columns.length < 2) {
		throw new Error('Select at least 2 columns to compute a correlation');
	}
	const schemaColumns = parseSchema(dataSource.schemaJson);
	const usable = new Set(continuousColumns(schemaColumns).map((c) => c.key));
	const invalid = columns.filter((c) => !usable.has(c));
	if (invalid.length > 0) {
		throw new Error(`The following are not numeric columns: ${invalid.join(', ')}`);
	}

	const stats = await computeSufficientStats(db, dataSource.tableName, columns[0], columns.slice(1));
	return buildCorrelationMatrix(stats, columns);
}
