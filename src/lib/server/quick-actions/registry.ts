import type { Db } from '../db';
import type { ToolEnv } from '../mcp';
import { getReminderChannelOptions } from '../db/reminder-service';
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

		case 'create_reminder': {
			const options = await getReminderChannelOptions(db, env);
			return [
				{
					type: 'form',
					title: 'リマインダー設定',
					tool: 'create_reminder',
					fields: [
						{ key: 'remind_at', label: '日時', type: 'datetime-local', required: true },
						{
							key: 'channels',
							label: '通知先',
							type: 'multiselect',
							required: true,
							value: 'notification',
							options
						},
						{ key: 'content', label: '内容', type: 'textarea', required: true }
					]
				}
			];
		}

		default:
			return [{ type: 'text', text: '不明なクイックアクションです' }];
	}
}
