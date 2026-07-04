import { welchTTest, twoProportionZTest, type TTestResult, type ProportionTestResult } from '$lib/analysis/ab-test';
import { continuousColumns } from '$lib/analysis/column-type';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';
import { computeGroupMeanStats, computeGroupProportionStats } from './ab-test-stats';

export type AbTestSpec = {
	groupColumn: string;
	metricColumn: string;
	testType: 'mean' | 'proportion';
	alpha: number;
};

export async function runAbTestFromDataSource(
	db: D1Database,
	dataSource: DataSource,
	spec: AbTestSpec
): Promise<TTestResult | ProportionTestResult> {
	const columns = parseSchema(dataSource.schemaJson);

	if (spec.groupColumn === spec.metricColumn) {
		throw new Error('グループ列と指標列に同じ列を指定することはできません');
	}
	if (!columns.some((c) => c.key === spec.groupColumn)) {
		throw new Error(`グループ列 "${spec.groupColumn}" がデータソースに存在しません`);
	}
	const usableMetric = new Set(continuousColumns(columns).map((c) => c.key));
	if (!usableMetric.has(spec.metricColumn)) {
		throw new Error(`指標列 "${spec.metricColumn}" は数値列ではないか、データソースに存在しません`);
	}

	if (spec.testType === 'proportion') {
		const [a, b] = await computeGroupProportionStats(db, dataSource.tableName, spec.groupColumn, spec.metricColumn);
		return twoProportionZTest(a, b, spec.alpha);
	}
	const [a, b] = await computeGroupMeanStats(db, dataSource.tableName, spec.groupColumn, spec.metricColumn);
	return welchTTest(a, b, spec.alpha);
}
