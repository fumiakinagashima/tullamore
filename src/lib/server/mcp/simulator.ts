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
import { predict } from '$lib/analysis/registry';
import { reviewSimulator } from '../analysis/review';

export const tools: Tool[] = [
	{
		name: 'create_simulator',
		description:
			'Generates and saves a simulator (regression model) given a target variable and explanatory variables. ' +
			'Call design_variables to check variable candidates and select_analysis_method to check the analysis method beforehand. ' +
			'Once created, it is shown in the chat as a simulator UI, letting the user move variables to run simulations.',
		input_schema: {
			type: 'object',
			properties: {
				data_source_id: { type: 'string', description: 'Data source ID' },
				name: { type: 'string', description: 'Simulator name (e.g. "Sales Forecast Simulator")' },
				description: { type: 'string', description: 'Simulator description (optional)' },
				target_column: { type: 'string', description: 'Target variable column name' },
				feature_columns: {
					type: 'array',
					items: { type: 'string' },
					description: 'Array of explanatory variable column names (one or more)'
				}
			},
			required: ['data_source_id', 'name', 'target_column', 'feature_columns']
		}
	},
	{
		name: 'list_simulators',
		description: 'Retrieves the list of saved simulators. Use this for requests like "show me the simulators" or "what simulators have been created?"',
		input_schema: { type: 'object', properties: {}, required: [] }
	},
	{
		name: 'get_simulator',
		description: 'Retrieves details of the specified simulator (model coefficients, accuracy metrics, variable ranges, etc.).',
		input_schema: {
			type: 'object',
			properties: { simulator_id: { type: 'string', description: 'Simulator ID' } },
			required: ['simulator_id']
		}
	},
	{
		name: 'update_simulator',
		description:
			'Updates the name/description of an existing simulator. If feature_columns is given, retrains with the new explanatory variables.',
		input_schema: {
			type: 'object',
			properties: {
				simulator_id: { type: 'string', description: 'Simulator ID' },
				name: { type: 'string', description: 'New name (optional)' },
				description: { type: 'string', description: 'New description (optional)' },
				feature_columns: {
					type: 'array',
					items: { type: 'string' },
					description: 'Specify to retrain with different explanatory variables'
				}
			},
			required: ['simulator_id']
		}
	},
	{
		name: 'predict_simulator',
		description:
			'Computes a predicted value by specifying concrete values for the simulator\'s explanatory variables. ' +
			'When presenting multiple scenarios (e.g. "what happens under scenario X?", "try an optimistic/pessimistic case"), ' +
			'call this tool multiple times and compare the results.',
		input_schema: {
			type: 'object',
			properties: {
				simulator_id: { type: 'string', description: 'Simulator ID' },
				variables: {
					type: 'object',
					description: 'A map of values keyed by explanatory variable column name (all explanatory variables must be specified)'
				}
			},
			required: ['simulator_id', 'variables']
		}
	},
	{
		name: 'review_simulator',
		description:
			'Checks the validity of a simulator (goodness of fit, sample size adequacy, multicollinearity among explanatory variables). ' +
			'Use this right after creating a simulator, or when asked about its accuracy.',
		input_schema: {
			type: 'object',
			properties: { simulator_id: { type: 'string', description: 'Simulator ID' } },
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
	if (!env?.DB) return { error: 'Could not connect to the database' };

	const source = await getDataSource(db, data.data_source_id);
	if (!source) return { error: 'Data source not found' };

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
	if (!row) return { error: 'Simulator not found' };
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
	if (!existing) return { error: 'Simulator not found' };

	const patch: Parameters<typeof updateSimulator>[2] = {};
	if (data.name !== undefined) patch.name = data.name;
	if (data.description !== undefined) patch.description = data.description;

	if (data.feature_columns) {
		if (!env?.DB) return { error: 'Could not connect to the database' };
		const source = await getDataSource(db, existing.dataSourceId);
		if (!source) return { error: 'Data source not found' };

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

const predictSimulatorInputSchema = z.object({
	simulator_id: z.string(),
	variables: z.record(z.string(), z.number())
});

export async function handlePredictSimulator(db: Db, input: unknown) {
	const { simulator_id, variables } = predictSimulatorInputSchema.parse(input);
	const row = await getSimulator(db, simulator_id);
	if (!row) return { error: 'Simulator not found' };
	const model = parseModel(row.modelJson);

	const missing = model.featureColumns.filter((c) => !(c in variables));
	if (missing.length > 0) return { error: `The following explanatory variable values were not specified: ${missing.join(', ')}` };

	let predictedValue: number;
	try {
		predictedValue = predict(model, variables);
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}

	const outOfRangeVariables = model.featureColumns.filter((c) => {
		const range = model.featureRanges[c];
		const v = variables[c];
		return range && (v < range.min || v > range.max);
	});

	return {
		simulator_id,
		predicted_value: predictedValue,
		variables_used: variables,
		out_of_range_variables: outOfRangeVariables,
		extrapolation_warning:
			outOfRangeVariables.length > 0
				? `${outOfRangeVariables.join(', ')} is outside the range of the observed data. The prediction's reliability is reduced`
				: null
	};
}

const reviewSimulatorInputSchema = z.object({ simulator_id: z.string() });

export async function handleReviewSimulator(db: Db, input: unknown, env?: { DB?: D1Database }) {
	const { simulator_id } = reviewSimulatorInputSchema.parse(input);
	const row = await getSimulator(db, simulator_id);
	if (!row) return { error: 'Simulator not found' };
	if (!env?.DB) return { error: 'Could not connect to the database' };
	const source = await getDataSource(db, row.dataSourceId);
	if (!source) return { error: 'Data source not found' };

	const model = parseModel(row.modelJson);
	return reviewSimulator(env.DB, source.tableName, model);
}
