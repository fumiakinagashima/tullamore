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
	/** Only returned when target_column is specified: feature-variable candidates ranked by descending absolute correlation coefficient */
	featureCandidates?: FeatureCandidate[];
};

function exclusionReason(type: AnalysisColumnType): string {
	switch (type) {
		case 'id':
			return 'Excluded from analysis because it is an ID/sequence column';
		case 'date':
			return 'Excluded because it is a date column (cannot currently be used directly as a regression feature variable)';
		case 'categorical':
			return 'Excluded because it is not numeric (direct support for categorical variables is not implemented yet)';
		default:
			return '';
	}
}

/**
 * Analyzes a data source's columns and returns the material the AI uses to suggest target/feature variable candidates.
 * When target_column is specified, ranks feature-variable candidates by their correlation coefficient with it
 * (based on summary statistics, independent of raw data).
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
		throw new Error(`Target variable "${targetColumn}" is not a numeric column, or does not exist in the data source`);
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
