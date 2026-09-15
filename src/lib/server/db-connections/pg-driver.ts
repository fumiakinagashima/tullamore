import { Client, types } from 'pg';
import type { DbConnectionDriver, ExternalColumn, ExternalTableRef } from './types';

// By default, pg interprets date/timestamp columns in the process's local timezone before converting
// them to Date objects, which means the same date parses to a different value under `bun dev` (the
// machine's local timezone, e.g. JST) versus `wrangler dev`/production (always UTC) — e.g. in a JST
// environment, DATE '2024-01-01' shifts by 9 hours to 2023-12-31T15:00:00.000Z. Receiving the raw
// string instead eliminates the timezone dependency
// (date=1082, timestamp without tz=1114, timestamptz=1184)
types.setTypeParser(1082, (val) => val);
types.setTypeParser(1114, (val) => val);
types.setTypeParser(1184, (val) => val);

// Identifiers (schema name, table name, column name) are expected to only ever come from values
// fetched from information_schema. Defensively verify no unexpected characters have crept in before
// embedding them directly into a SQL string.
function assertSafeIdentifier(id: string): void {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
		throw new Error(`Invalid identifier: ${id}`);
	}
}

/**
 * Shared `pg.Client`-based Postgres driver implementation. Query logic that doesn't depend on the
 * connection method (via a Hyperdrive binding or a direct TCP connection) lives here. Both
 * hyperdrive.ts and tcp-socket.ts call this function, passing only the `pg.Client` constructor args.
 *
 * The connection is established once, on the first query, and reused across subsequent calls (it's
 * more efficient to run a sequence of operations — list tables → fetch columns → fetch rows — over a
 * single connection). Callers must always call close() in a finally block.
 */
export function createPgDriver(clientConfig: ConstructorParameters<typeof Client>[0]): DbConnectionDriver {
	const client = new Client(clientConfig);
	let connected = false;

	async function ensureConnected(): Promise<void> {
		if (!connected) {
			await client.connect();
			connected = true;
		}
	}

	return {
		engine: 'postgres',

		async listTables(): Promise<ExternalTableRef[]> {
			await ensureConnected();
			const res = await client.query<{ table_schema: string; table_name: string }>(
				`SELECT table_schema, table_name FROM information_schema.tables
				 WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
				 ORDER BY table_schema, table_name`
			);
			return res.rows.map((r) => ({ schema: r.table_schema, name: r.table_name }));
		},

		async listColumns(table: ExternalTableRef): Promise<ExternalColumn[]> {
			await ensureConnected();
			const res = await client.query<{ column_name: string; data_type: string }>(
				`SELECT column_name, data_type FROM information_schema.columns
				 WHERE table_schema = $1 AND table_name = $2
				 ORDER BY ordinal_position`,
				[table.schema, table.name]
			);
			return res.rows.map((r) => ({ name: r.column_name, dataType: r.data_type }));
		},

		async fetchRows(
			table: ExternalTableRef,
			columns: string[],
			offset: number,
			limit: number
		): Promise<Record<string, unknown>[]> {
			await ensureConnected();
			assertSafeIdentifier(table.schema);
			assertSafeIdentifier(table.name);
			columns.forEach(assertSafeIdentifier);
			const colList = columns.map((c) => `"${c}"`).join(', ');
			const sql = `SELECT ${colList} FROM "${table.schema}"."${table.name}" LIMIT $1 OFFSET $2`;
			const res = await client.query(sql, [limit, offset]);
			return res.rows;
		},

		async close(): Promise<void> {
			if (connected) await client.end();
		}
	};
}
