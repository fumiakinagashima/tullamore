import type { Db } from '../db';
import type { ToolEnv } from '../mcp';
import { listDataSources, parseSchema } from '../db/data-source-service';
import type { MessageContent } from '$lib/types/chat';
import type { QuickActionId } from '$lib/quick-actions/catalog';

export async function runQuickAction(db: Db, id: QuickActionId, env?: ToolEnv): Promise<MessageContent[]> {
	switch (id) {
		case 'list_data_sources': {
			const sources = await listDataSources(db);
			if (sources.length === 0) {
				return [
					{ type: 'text', text: 'データソースが登録されていません。' },
					{ type: 'link', label: 'データソースを追加する', href: '/data', description: 'CSVのインポートやテーブル作成ができます' }
				];
			}
			return [
				{
					type: 'table',
					columns: [
						{ key: 'name', label: 'データソース名' },
						{ key: 'description', label: '説明' },
						{ key: 'columns', label: 'カラム数' },
						{ key: 'row_count', label: 'レコード数' }
					],
					rows: sources.map((s) => ({
						id: s.id,
						name: s.name,
						description: s.description ?? '',
						columns: parseSchema(s.schemaJson).length,
						row_count: s.rowCount
					}))
				}
			];
		}

		default:
			return [{ type: 'text', text: '不明なクイックアクションです' }];
	}
}
