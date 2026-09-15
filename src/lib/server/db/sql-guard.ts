import { getTableName } from 'drizzle-orm';
import * as schema from './schema';
import { listDataSources } from './data-source-service';
import type { Db } from './index';

const DANGEROUS_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|ATTACH|DETACH)\b/i;

// SQLite's built-in catalog tables (blocked since they could be used to enumerate all table names, etc.)
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
		return 'Only SELECT statements can be executed';
	}
	if (DANGEROUS_KEYWORDS.test(sql)) {
		return 'SQL statements other than SELECT cannot be executed';
	}
	return null;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Detects and rejects access, via word matching in the query string, to anything other than the
// ds_* tables registered in data_sources (app-internal tables such as accounts, integrations,
// email_providers, and the SQLite catalog). Since these are fetched dynamically from schema.ts,
// no new internal table introduced by a schema change will slip through unblocked.
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
			return 'Access to this table is not permitted';
		}
	}
	return null;
}
