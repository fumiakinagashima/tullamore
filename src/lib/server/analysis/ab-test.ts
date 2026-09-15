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
		throw new Error('The group column and metric column cannot be the same column');
	}
	if (!columns.some((c) => c.key === spec.groupColumn)) {
		throw new Error(`Group column "${spec.groupColumn}" does not exist in the data source`);
	}
	const usableMetric = new Set(continuousColumns(columns).map((c) => c.key));
	if (!usableMetric.has(spec.metricColumn)) {
		throw new Error(`Metric column "${spec.metricColumn}" is not a numeric column, or does not exist in the data source`);
	}

	if (spec.testType === 'proportion') {
		const [a, b] = await computeGroupProportionStats(db, dataSource.tableName, spec.groupColumn, spec.metricColumn);
		return twoProportionZTest(a, b, spec.alpha);
	}
	const [a, b] = await computeGroupMeanStats(db, dataSource.tableName, spec.groupColumn, spec.metricColumn);
	return welchTTest(a, b, spec.alpha);
}
