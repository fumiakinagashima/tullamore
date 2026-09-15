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
			'Analyzes the columns of the specified data source and proposes candidate target and feature variables. Use this as the first step in creating a simulator. ' +
			'If target_column is given, it ranks candidate feature variables by their correlation coefficient with that column (largest absolute correlation first).',
		input_schema: {
			type: 'object',
			properties: {
				data_source_id: { type: 'string', description: 'Data source ID (check with list_data_sources)' },
				target_column: { type: 'string', description: 'Target variable column name (if omitted, only the list of candidate target variables is returned)' }
			},
			required: ['data_source_id']
		}
	},
	{
		name: 'select_analysis_method',
		description: 'Determines the appropriate analysis method based on the nature of the target variable. Call this after deciding on the target variable with design_variables.',
		input_schema: {
			type: 'object',
			properties: {
				data_source_id: { type: 'string', description: 'Data source ID' },
				target_column: { type: 'string', description: 'Target variable column name' }
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
	if (!source) return { error: 'Data source not found' };
	if (!env?.DB) return { error: 'Unable to connect to the database' };

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
	if (!source) return { error: 'Data source not found' };
	return selectAnalysisMethod(source, target_column);
}
