import { z } from 'zod/v4';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { listDataSources, getDataSource, parseSchema } from '../db/data-source-service';
import { validateSelectOnly, validateNoSystemTables } from '../db/sql-guard';
import type { Db } from '../db';

export const tools: Tool[] = [
	{
		name: 'list_data_sources',
		description: 'Returns the list of available data sources (tables) and their schemas. Always call this before starting an analysis to check what data is available.',
		input_schema: {
			type: 'object' as const,
			properties: {},
			required: []
		}
	},
	{
		name: 'execute_sql',
		description: 'Runs a SELECT query against the D1 database and returns the results. Supports complex queries such as aggregation, filtering, JOIN, and GROUP BY. Only SELECT is allowed (no INSERT/UPDATE/DELETE/DROP). Use table names as confirmed via list_data_sources.',
		input_schema: {
			type: 'object' as const,
			properties: {
				sql: {
					type: 'string',
					description: 'The SQL query to run (SELECT statements only)'
				},
				description: {
					type: 'string',
					description: 'A brief explanation of what this query fetches (for logging)'
				}
			},
			required: ['sql']
		}
	},
	{
		name: 'preview_data',
		description: 'Returns the first 20 rows of the specified data source as a preview. Use this to understand the shape and content of the data before writing SQL.',
		input_schema: {
			type: 'object' as const,
			properties: {
				data_source_id: {
					type: 'string',
					description: 'The data source ID'
				}
			},
			required: ['data_source_id']
		}
	}
];

export async function handleListDataSources(db: Db) {
	const sources = await listDataSources(db);
	if (sources.length === 0) {
		return { count: 0, data_sources: [], message: 'No data sources are registered. Please add a data source from the /database page.' };
	}
	return {
		count: sources.length,
		data_sources: sources.map((s) => ({
			id: s.id,
			name: s.name,
			description: s.description,
			table_name: s.tableName,
			row_count: s.rowCount,
			columns: parseSchema(s.schemaJson)
		}))
	};
}

const executeSqlInputSchema = z.object({
	sql: z.string(),
	description: z.string().optional()
});

export async function handleExecuteSql(db: Db, input: unknown, env?: { DB?: D1Database }) {
	const { sql } = executeSqlInputSchema.parse(input);

	const selectError = validateSelectOnly(sql);
	if (selectError) return { error: selectError };

	if (!env?.DB) return { error: 'Could not connect to the database' };

	const systemError = await validateNoSystemTables(db, sql);
	if (systemError) return { error: systemError };

	try {
		const result = await env.DB.prepare(sql).all();
		const rows = result.results as Record<string, unknown>[];
		const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
		return {
			columns,
			rows,
			row_count: rows.length,
			truncated: rows.length === 1000
		};
	} catch (e) {
		return { error: `SQL error: ${e instanceof Error ? e.message : String(e)}` };
	}
}

const previewDataInputSchema = z.object({
	data_source_id: z.string()
});

export async function handlePreviewData(db: Db, input: unknown, env?: { DB?: D1Database }) {
	const { data_source_id } = previewDataInputSchema.parse(input);
	const source = await getDataSource(db, data_source_id);
	if (!source) return { error: 'Data source not found' };
	if (!env?.DB) return { error: 'Could not connect to the database' };

	try {
		const result = await env.DB.prepare(`SELECT * FROM \`${source.tableName}\` LIMIT 20`).all();
		const rows = result.results as Record<string, unknown>[];
		return {
			data_source: { id: source.id, name: source.name, table_name: source.tableName },
			columns: parseSchema(source.schemaJson),
			rows,
			row_count: source.rowCount
		};
	} catch (e) {
		return { error: `Preview error: ${e instanceof Error ? e.message : String(e)}` };
	}
}
