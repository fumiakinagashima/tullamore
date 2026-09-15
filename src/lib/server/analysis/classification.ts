import { fitLogisticRegression, type LogisticRegressionModel } from '$lib/analysis/methods/logistic-regression';
import { continuousColumns } from '$lib/analysis/column-type';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';
import { quoteIdent } from './sql-ident';
import { LOGISTIC_REGRESSION_MAX_ITERATIONS, LOGISTIC_REGRESSION_CONVERGENCE_TOLERANCE } from '$lib/constants';

// Heuristic for which of the target variable's two values counts as the "positive class (1)".
// If none match, the second of distinctValues (the latter in alphabetical/retrieval order) is treated as positive
const POSITIVE_HEURISTICS = new Set(['1', 'true', 'yes', 'y', 'はい', '有', '成約', '成功', '購入', 'あり', '有り']);

export type ClassificationSpec = {
	targetColumn: string;
	featureColumns: string[];
	maxRows: number;
};

export type ClassificationFitResult = {
	model: LogisticRegressionModel;
	/** True if the row count was truncated at maxRows (training used only that sample) */
	truncated: boolean;
};

/**
 * Unlike OLS, logistic regression can't be reduced to summary statistics, so we fetch raw row data
 * up to maxRows (the caller passes LOGISTIC_REGRESSION_MAX_ROWS) and solve IRLS in JS.
 */
export async function fitClassifierFromDataSource(
	db: D1Database,
	dataSource: DataSource,
	spec: ClassificationSpec
): Promise<ClassificationFitResult> {
	const columns = parseSchema(dataSource.schemaJson);
	const usableFeatures = new Set(continuousColumns(columns).map((c) => c.key));
	const invalidFeatures = spec.featureColumns.filter((c) => !usableFeatures.has(c));
	if (invalidFeatures.length > 0) {
		throw new Error(`The feature variables include non-numeric columns: ${invalidFeatures.join(', ')}`);
	}
	if (spec.featureColumns.includes(spec.targetColumn)) {
		throw new Error('The target variable and feature variables cannot share the same column');
	}
	if (!columns.some((c) => c.key === spec.targetColumn)) {
		throw new Error(`Target variable "${spec.targetColumn}" does not exist in the data source`);
	}

	const t = quoteIdent(spec.targetColumn);
	const featureIdents = spec.featureColumns.map(quoteIdent);
	const selectCols = [`${t} AS target`, ...featureIdents.map((c, i) => `${c} AS f${i}`)];
	const whereCols = [t, ...featureIdents];
	const where = whereCols.map((c) => `${c} IS NOT NULL`).join(' AND ');
	const sql = `SELECT ${selectCols.join(', ')} FROM ${quoteIdent(dataSource.tableName)} WHERE ${where} LIMIT ?`;

	const res = await db
		.prepare(sql)
		.bind(spec.maxRows)
		.all<Record<string, string | number>>();

	if (res.results.length === 0) {
		throw new Error('No rows without missing values were found to analyze');
	}

	const distinctValues = Array.from(new Set(res.results.map((r) => String(r.target))));
	if (distinctValues.length !== 2) {
		const shown = distinctValues.slice(0, 5).join(', ');
		throw new Error(
			`Target variable "${spec.targetColumn}" must have exactly two distinct values (found: ${shown}${distinctValues.length > 5 ? ', and more' : ''})`
		);
	}

	const positiveClassLabel = distinctValues.find((v) => POSITIVE_HEURISTICS.has(v.toLowerCase())) ?? distinctValues[1];

	const rows = res.results.map((r) => ({
		features: spec.featureColumns.map((_, i) => Number(r[`f${i}`])),
		target: (String(r.target) === positiveClassLabel ? 1 : 0) as 0 | 1
	}));

	const model = fitLogisticRegression(rows, spec.targetColumn, spec.featureColumns, positiveClassLabel, {
		maxIterations: LOGISTIC_REGRESSION_MAX_ITERATIONS,
		tolerance: LOGISTIC_REGRESSION_CONVERGENCE_TOLERANCE
	});

	return { model, truncated: res.results.length >= spec.maxRows };
}
