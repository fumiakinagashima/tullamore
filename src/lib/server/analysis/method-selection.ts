import { inferAnalysisColumnType } from '$lib/analysis/column-type';
import type { AnalysisMethod } from '$lib/analysis/types';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';

export type MethodSelectionResult = {
	method: AnalysisMethod | null;
	reason: string;
};

/**
 * Determines the analysis method from the nature of the target variable. Currently only
 * multiple regression (linear combination) is supported (the AnalysisMethod registry in
 * src/lib/analysis/registry.ts). If classification, time-series forecasting, etc. are
 * added later, extend the decision logic here.
 */
export function selectAnalysisMethod(dataSource: DataSource, targetColumn: string): MethodSelectionResult {
	const columns = parseSchema(dataSource.schemaJson);
	const target = columns.find((c) => c.key === targetColumn);
	if (!target) {
		return { method: null, reason: `"${targetColumn}" does not exist in the data source` };
	}

	const type = inferAnalysisColumnType(target);
	if (type !== 'continuous') {
		return {
			method: null,
			reason: `The target variable "${targetColumn}" is not a continuous numeric value (no supported analysis method exists for this yet; classification methods may be considered for categorical variables in the future)`
		};
	}

	return {
		method: 'linear_regression',
		reason: 'Since the target variable is a continuous numeric value, multiple regression analysis (linear combination) can be used. Currently, multiple regression is the only supported analysis method'
	};
}
