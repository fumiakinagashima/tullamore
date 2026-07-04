import { fitLogisticRegression, type LogisticRegressionModel } from '$lib/analysis/methods/logistic-regression';
import { continuousColumns } from '$lib/analysis/column-type';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';
import { quoteIdent } from './sql-ident';
import { LOGISTIC_REGRESSION_MAX_ITERATIONS, LOGISTIC_REGRESSION_CONVERGENCE_TOLERANCE } from '$lib/constants';

// 目的変数の2値のうち、どちらを「正例（1）」として扱うかのヒューリスティック。
// 一致しない場合は distinctValues の2つ目（アルファベット/取得順で後者）を正例として扱う
const POSITIVE_HEURISTICS = new Set(['1', 'true', 'yes', 'y', 'はい', '有', '成約', '成功', '購入', 'あり', '有り']);

export type ClassificationSpec = {
	targetColumn: string;
	featureColumns: string[];
	maxRows: number;
};

export type ClassificationFitResult = {
	model: LogisticRegressionModel;
	/** maxRowsに達して行数を打ち切った場合true（学習はそのサンプルのみで行われている） */
	truncated: boolean;
};

/**
 * ロジスティック回帰はOLSと異なりサマリー統計量に還元できないため、生の行データを
 * maxRows（呼び出し側でLOGISTIC_REGRESSION_MAX_ROWS）まで取得してJS側でIRLSを解く。
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
		throw new Error(`説明変数に数値列でないものが含まれています: ${invalidFeatures.join(', ')}`);
	}
	if (spec.featureColumns.includes(spec.targetColumn)) {
		throw new Error('目的変数と説明変数に同じ列を指定することはできません');
	}
	if (!columns.some((c) => c.key === spec.targetColumn)) {
		throw new Error(`目的変数 "${spec.targetColumn}" がデータソースに存在しません`);
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
		throw new Error('分析対象の欠損値のない行が見つかりませんでした');
	}

	const distinctValues = Array.from(new Set(res.results.map((r) => String(r.target))));
	if (distinctValues.length !== 2) {
		const shown = distinctValues.slice(0, 5).join(', ');
		throw new Error(
			`目的変数 "${spec.targetColumn}" の値が2種類である必要があります（現在: ${shown}${distinctValues.length > 5 ? ' 等' : ''}）`
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
