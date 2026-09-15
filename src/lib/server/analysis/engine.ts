import type { Model, ModelSpec } from '$lib/analysis/types';
import { fitModel } from '$lib/analysis/registry';
import { continuousColumns } from '$lib/analysis/column-type';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';
import { computeSufficientStats } from './sufficient-stats';

/**
 * Trains a model from a data source and an analysis spec (target variable, feature variables, method).
 * This is the entry point called from MCP tools (e.g., Phase 3's create_simulator).
 */
export async function fitModelFromDataSource(db: D1Database, dataSource: DataSource, spec: ModelSpec): Promise<Model> {
	const columns = parseSchema(dataSource.schemaJson);
	const usable = new Set(continuousColumns(columns).map((c) => c.key));

	if (!usable.has(spec.targetColumn)) {
		throw new Error(`Target variable "${spec.targetColumn}" is not a numeric column or does not exist in the data source`);
	}
	const invalidFeatures = spec.featureColumns.filter((c) => !usable.has(c));
	if (invalidFeatures.length > 0) {
		throw new Error(`The feature variables include columns that are not numeric: ${invalidFeatures.join(', ')}`);
	}
	if (spec.featureColumns.includes(spec.targetColumn)) {
		throw new Error('The target variable and a feature variable cannot be the same column');
	}

	const stats = await computeSufficientStats(db, dataSource.tableName, spec.targetColumn, spec.featureColumns);
	return fitModel(spec.method, stats, spec.targetColumn, spec.featureColumns);
}
