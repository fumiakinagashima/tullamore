import { rankFeaturesByCorrelation } from '$lib/analysis/correlation';
import { continuousColumns, inferAnalysisColumnType, type AnalysisColumnType } from '$lib/analysis/column-type';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';
import { computeSufficientStats } from './sufficient-stats';

export type ColumnCandidate = { key: string; label: string };
export type ExcludedColumn = ColumnCandidate & { reason: string };
export type FeatureCandidate = ColumnCandidate & { correlation: number };

export type VariableDesignResult = {
	targetCandidates: ColumnCandidate[];
	excludedColumns: ExcludedColumn[];
	/** target_column を指定した場合のみ、相関係数の絶対値が大きい順に説明変数候補を返す */
	featureCandidates?: FeatureCandidate[];
};

function exclusionReason(type: AnalysisColumnType): string {
	switch (type) {
		case 'id':
			return 'ID・連番列のため分析対象から除外';
		case 'date':
			return '日付列のため（現時点では回帰の説明変数として直接は使えません）';
		case 'categorical':
			return '数値でないため（カテゴリ変数の直接対応は未実装）';
		default:
			return '';
	}
}

/**
 * データソースの列を分析し、目的変数・説明変数の候補をAIに提案させるための材料を返す。
 * target_column を指定すると、それとの相関係数（サマリー統計量ベース、生データ非依存）で
 * 説明変数候補をランキングする。
 */
export async function designVariables(
	db: D1Database,
	dataSource: DataSource,
	targetColumn?: string
): Promise<VariableDesignResult> {
	const columns = parseSchema(dataSource.schemaJson);
	const continuous = continuousColumns(columns);
	const excludedColumns: ExcludedColumn[] = columns
		.filter((c) => inferAnalysisColumnType(c) !== 'continuous')
		.map((c) => ({ key: c.key, label: c.label, reason: exclusionReason(inferAnalysisColumnType(c)) }));
	const targetCandidates = continuous.map((c) => ({ key: c.key, label: c.label }));

	if (!targetColumn) {
		return { targetCandidates, excludedColumns };
	}

	const target = continuous.find((c) => c.key === targetColumn);
	if (!target) {
		throw new Error(`目的変数 "${targetColumn}" は数値列ではないか、データソースに存在しません`);
	}

	const otherContinuous = continuous.filter((c) => c.key !== targetColumn);
	if (otherContinuous.length === 0) {
		return { targetCandidates, excludedColumns, featureCandidates: [] };
	}

	const stats = await computeSufficientStats(
		db,
		dataSource.tableName,
		targetColumn,
		otherContinuous.map((c) => c.key)
	);
	const ranked = rankFeaturesByCorrelation(stats, otherContinuous.map((c) => c.key));
	const labelByKey = new Map(otherContinuous.map((c) => [c.key, c.label]));

	return {
		targetCandidates,
		excludedColumns,
		featureCandidates: ranked.map((r) => ({
			key: r.column,
			label: labelByKey.get(r.column) ?? r.column,
			correlation: r.correlation
		}))
	};
}
