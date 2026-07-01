import { getTableName } from 'drizzle-orm';
import * as schema from './schema';
import { listDataSources } from './data-source-service';
import type { Db } from './index';

const DANGEROUS_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|ATTACH|DETACH)\b/i;

// SQLite の組み込みカタログテーブル（全テーブル名の列挙などに使われうるため塞ぐ）
const SQLITE_INTERNAL_TABLES = [
	'sqlite_master',
	'sqlite_schema',
	'sqlite_temp_master',
	'sqlite_temp_schema',
	'sqlite_sequence',
	'sqlite_stat1',
	'sqlite_stat4'
];

export function validateSelectOnly(sql: string): string | null {
	const normalized = sql.trim().toUpperCase();
	if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
		return 'SELECT文のみ実行できます';
	}
	if (DANGEROUS_KEYWORDS.test(sql)) {
		return 'SELECT以外のSQL文は実行できません';
	}
	return null;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// data_sources に登録された ds_* テーブル以外（accounts・integrations・email_providers 等の
// アプリ内部テーブル、SQLiteカタログ）へのアクセスを、クエリ文字列中の単語一致で検出して拒否する。
// スキーマ変更で内部テーブルが増えても schema.ts から動的に取得するため塞ぎ漏れしない。
export async function validateNoSystemTables(db: Db, sql: string): Promise<string | null> {
	const sources = await listDataSources(db);
	const allowedTables = new Set(sources.map((s) => s.tableName));

	const internalTables = Object.values(schema)
		.map((table) => {
			try {
				return getTableName(table as Parameters<typeof getTableName>[0]);
			} catch {
				return null;
			}
		})
		.filter((name): name is string => !!name);

	const forbidden = [...internalTables, ...SQLITE_INTERNAL_TABLES].filter((t) => !allowedTables.has(t));

	for (const table of forbidden) {
		if (new RegExp(`\\b${escapeRegExp(table)}\\b`, 'i').test(sql)) {
			return 'このテーブルへのアクセスは許可されていません';
		}
	}
	return null;
}
