import type { Model, ModelSpec } from '$lib/analysis/types';
import { fitModel } from '$lib/analysis/registry';
import { continuousColumns } from '$lib/analysis/column-type';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';
import { computeSufficientStats } from './sufficient-stats';

/**
 * データソース＋分析仕様（目的変数・説明変数・手法）からモデルを学習する。
 * MCPツール（Phase 3の create_simulator 等）から呼び出すエントリポイント。
 */
export async function fitModelFromDataSource(db: D1Database, dataSource: DataSource, spec: ModelSpec): Promise<Model> {
	const columns = parseSchema(dataSource.schemaJson);
	const usable = new Set(continuousColumns(columns).map((c) => c.key));

	if (!usable.has(spec.targetColumn)) {
		throw new Error(`目的変数 "${spec.targetColumn}" は数値列ではないか、データソースに存在しません`);
	}
	const invalidFeatures = spec.featureColumns.filter((c) => !usable.has(c));
	if (invalidFeatures.length > 0) {
		throw new Error(`説明変数に数値列でないものが含まれています: ${invalidFeatures.join(', ')}`);
	}
	if (spec.featureColumns.includes(spec.targetColumn)) {
		throw new Error('目的変数と説明変数に同じ列を指定することはできません');
	}

	const stats = await computeSufficientStats(db, dataSource.tableName, spec.targetColumn, spec.featureColumns);
	return fitModel(spec.method, stats, spec.targetColumn, spec.featureColumns);
}
