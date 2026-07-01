import { z } from 'zod/v4';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { listDataSources, getDataSource, parseSchema } from '../db/data-source-service';
import { validateSelectOnly, validateNoSystemTables } from '../db/sql-guard';
import type { Db } from '../db';

export const tools: Tool[] = [
	{
		name: 'list_data_sources',
		description: '利用可能なデータソース（テーブル）の一覧とスキーマを返す。分析を始める前に必ず呼び出して、どのデータが使えるか確認すること。',
		input_schema: {
			type: 'object' as const,
			properties: {},
			required: []
		}
	},
	{
		name: 'execute_sql',
		description: 'D1データベースに対してSELECTクエリを実行し、結果を返す。集計・フィルタ・JOIN・GROUP BYなど複雑なクエリも可能。SELECTのみ許可（INSERT/UPDATE/DELETE/DROP不可）。テーブル名は list_data_sources で確認したものを使うこと。',
		input_schema: {
			type: 'object' as const,
			properties: {
				sql: {
					type: 'string',
					description: '実行するSQLクエリ（SELECT文のみ）'
				},
				description: {
					type: 'string',
					description: 'このクエリが何を取得するか簡単に説明（ログ用）'
				}
			},
			required: ['sql']
		}
	},
	{
		name: 'preview_data',
		description: '指定したデータソースの先頭20行をプレビューとして返す。データの形式・内容を把握してSQLを書く前の確認に使う。',
		input_schema: {
			type: 'object' as const,
			properties: {
				data_source_id: {
					type: 'string',
					description: 'データソースID'
				}
			},
			required: ['data_source_id']
		}
	}
];

export async function handleListDataSources(db: Db) {
	const sources = await listDataSources(db);
	if (sources.length === 0) {
		return { count: 0, data_sources: [], message: 'データソースが登録されていません。/database ページからデータソースを追加してください。' };
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

	if (!env?.DB) return { error: 'データベースに接続できません' };

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
		return { error: `SQLエラー: ${e instanceof Error ? e.message : String(e)}` };
	}
}

const previewDataInputSchema = z.object({
	data_source_id: z.string()
});

export async function handlePreviewData(db: Db, input: unknown, env?: { DB?: D1Database }) {
	const { data_source_id } = previewDataInputSchema.parse(input);
	const source = await getDataSource(db, data_source_id);
	if (!source) return { error: 'データソースが見つかりません' };
	if (!env?.DB) return { error: 'データベースに接続できません' };

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
		return { error: `プレビューエラー: ${e instanceof Error ? e.message : String(e)}` };
	}
}
