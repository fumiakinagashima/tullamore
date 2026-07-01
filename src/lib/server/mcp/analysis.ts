import { z } from 'zod';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { Db } from '../db';
import { getDataSource } from '../db/data-source-service';
import { designVariables } from '../analysis/variable-design';
import { selectAnalysisMethod } from '../analysis/method-selection';

export const tools: Tool[] = [
	{
		name: 'design_variables',
		description:
			'指定したデータソースの列を分析し、目的変数・説明変数の候補を提案する。シミュレーター作成の最初のステップとして使う。' +
			'target_column を指定すると、その列との相関係数で説明変数候補をランキングして返す（相関の絶対値が大きい順）。',
		input_schema: {
			type: 'object',
			properties: {
				data_source_id: { type: 'string', description: 'データソースID（list_data_sources で確認）' },
				target_column: { type: 'string', description: '目的変数の列名（省略時は目的変数の候補一覧のみ返す）' }
			},
			required: ['data_source_id']
		}
	},
	{
		name: 'select_analysis_method',
		description: '目的変数の性質から適切な分析手法を判別する。design_variables で目的変数を決めた後に呼び出す。',
		input_schema: {
			type: 'object',
			properties: {
				data_source_id: { type: 'string', description: 'データソースID' },
				target_column: { type: 'string', description: '目的変数の列名' }
			},
			required: ['data_source_id', 'target_column']
		}
	}
];

const designVariablesInputSchema = z.object({
	data_source_id: z.string(),
	target_column: z.string().optional()
});

export async function handleDesignVariables(db: Db, input: unknown, env?: { DB?: D1Database }) {
	const { data_source_id, target_column } = designVariablesInputSchema.parse(input);
	const source = await getDataSource(db, data_source_id);
	if (!source) return { error: 'データソースが見つかりません' };
	if (!env?.DB) return { error: 'データベースに接続できません' };

	try {
		return await designVariables(env.DB, source, target_column);
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
}

const selectAnalysisMethodInputSchema = z.object({
	data_source_id: z.string(),
	target_column: z.string()
});

export async function handleSelectAnalysisMethod(db: Db, input: unknown) {
	const { data_source_id, target_column } = selectAnalysisMethodInputSchema.parse(input);
	const source = await getDataSource(db, data_source_id);
	if (!source) return { error: 'データソースが見つかりません' };
	return selectAnalysisMethod(source, target_column);
}
