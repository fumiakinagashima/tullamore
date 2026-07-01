import { z } from 'zod';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { Db } from '../db';
import { getDataSource } from '../db/data-source-service';
import {
	createSimulator,
	getSimulator,
	listSimulators,
	parseFeatureColumns,
	parseModel,
	updateSimulator
} from '../db/simulator-service';
import { fitModelFromDataSource } from '../analysis/engine';

export const tools: Tool[] = [
	{
		name: 'create_simulator',
		description:
			'目的変数・説明変数を指定してシミュレーター（回帰モデル）を生成し保存する。' +
			'事前に design_variables で変数候補を、select_analysis_method で分析手法を確認してから呼び出すこと。' +
			'生成後はチャットに simulator UI として表示され、ユーザーが変数を動かしてシミュレーションできるようになる。',
		input_schema: {
			type: 'object',
			properties: {
				data_source_id: { type: 'string', description: 'データソースID' },
				name: { type: 'string', description: 'シミュレーターの名前（例: 「売上予測シミュレーター」）' },
				description: { type: 'string', description: 'シミュレーターの説明（任意）' },
				target_column: { type: 'string', description: '目的変数の列名' },
				feature_columns: {
					type: 'array',
					items: { type: 'string' },
					description: '説明変数の列名の配列（1個以上）'
				}
			},
			required: ['data_source_id', 'name', 'target_column', 'feature_columns']
		}
	},
	{
		name: 'list_simulators',
		description: '保存済みのシミュレーター一覧を取得する。「シミュレーターを見せて」「作成済みのシミュレーターは？」等に使う。',
		input_schema: { type: 'object', properties: {}, required: [] }
	},
	{
		name: 'get_simulator',
		description: '指定したシミュレーターの詳細（モデルの係数・精度指標・変数レンジ等）を取得する。',
		input_schema: {
			type: 'object',
			properties: { simulator_id: { type: 'string', description: 'シミュレーターID' } },
			required: ['simulator_id']
		}
	},
	{
		name: 'update_simulator',
		description:
			'既存のシミュレーターの名前・説明を更新する。feature_columns を指定した場合は説明変数を変えて再学習する。',
		input_schema: {
			type: 'object',
			properties: {
				simulator_id: { type: 'string', description: 'シミュレーターID' },
				name: { type: 'string', description: '新しい名前（任意）' },
				description: { type: 'string', description: '新しい説明（任意）' },
				feature_columns: {
					type: 'array',
					items: { type: 'string' },
					description: '説明変数を変更して再学習する場合に指定'
				}
			},
			required: ['simulator_id']
		}
	}
];

function summarize(row: Awaited<ReturnType<typeof getSimulator>>) {
	if (!row) return null;
	const model = parseModel(row.modelJson);
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		data_source_id: row.dataSourceId,
		method: row.method,
		target_column: row.targetColumn,
		feature_columns: parseFeatureColumns(row.featureColumns),
		model,
		created_at: row.createdAt.toISOString()
	};
}

const createSimulatorInputSchema = z.object({
	data_source_id: z.string(),
	name: z.string().min(1),
	description: z.string().optional(),
	target_column: z.string(),
	feature_columns: z.array(z.string()).min(1)
});

export async function handleCreateSimulator(db: Db, input: unknown, env?: { DB?: D1Database; accountId?: string }) {
	const data = createSimulatorInputSchema.parse(input);
	if (!env?.DB) return { error: 'データベースに接続できません' };

	const source = await getDataSource(db, data.data_source_id);
	if (!source) return { error: 'データソースが見つかりません' };

	let model;
	try {
		model = await fitModelFromDataSource(env.DB, source, {
			method: 'linear_regression',
			targetColumn: data.target_column,
			featureColumns: data.feature_columns
		});
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}

	const id = crypto.randomUUID();
	const row = await createSimulator(db, {
		id,
		name: data.name,
		description: data.description ?? null,
		dataSourceId: data.data_source_id,
		method: model.method,
		targetColumn: data.target_column,
		featureColumns: JSON.stringify(data.feature_columns),
		modelJson: JSON.stringify(model),
		createdBy: env.accountId ?? null
	});

	return summarize(row);
}

export async function handleListSimulators(db: Db) {
	const rows = await listSimulators(db);
	return {
		count: rows.length,
		simulators: rows.map((row) => {
			const model = parseModel(row.modelJson);
			return {
				id: row.id,
				name: row.name,
				description: row.description,
				target_column: row.targetColumn,
				feature_columns: parseFeatureColumns(row.featureColumns),
				method: row.method,
				r2: model.metrics.r2,
				sample_size: model.metrics.sampleSize,
				created_at: row.createdAt.toISOString()
			};
		})
	};
}

const getSimulatorInputSchema = z.object({ simulator_id: z.string() });

export async function handleGetSimulator(db: Db, input: unknown) {
	const { simulator_id } = getSimulatorInputSchema.parse(input);
	const row = await getSimulator(db, simulator_id);
	if (!row) return { error: 'シミュレーターが見つかりません' };
	return summarize(row);
}

const updateSimulatorInputSchema = z.object({
	simulator_id: z.string(),
	name: z.string().min(1).optional(),
	description: z.string().optional(),
	feature_columns: z.array(z.string()).min(1).optional()
});

export async function handleUpdateSimulator(db: Db, input: unknown, env?: { DB?: D1Database }) {
	const data = updateSimulatorInputSchema.parse(input);
	const existing = await getSimulator(db, data.simulator_id);
	if (!existing) return { error: 'シミュレーターが見つかりません' };

	const patch: Parameters<typeof updateSimulator>[2] = {};
	if (data.name !== undefined) patch.name = data.name;
	if (data.description !== undefined) patch.description = data.description;

	if (data.feature_columns) {
		if (!env?.DB) return { error: 'データベースに接続できません' };
		const source = await getDataSource(db, existing.dataSourceId);
		if (!source) return { error: 'データソースが見つかりません' };

		let model;
		try {
			model = await fitModelFromDataSource(env.DB, source, {
				method: 'linear_regression',
				targetColumn: existing.targetColumn,
				featureColumns: data.feature_columns
			});
		} catch (e) {
			return { error: e instanceof Error ? e.message : String(e) };
		}
		patch.featureColumns = JSON.stringify(data.feature_columns);
		patch.modelJson = JSON.stringify(model);
	}

	const row = await updateSimulator(db, data.simulator_id, patch);
	return summarize(row);
}
