import { createConnection, type Connection, type ConnectionOptions, type RowDataPacket } from 'mysql2/promise';
import type { DbConnectionDriver, ExternalColumn, ExternalTableRef } from './types';

// Identifiers (schema name, table name, column name) are assumed to always come from values obtained via information_schema.
// Defensively validate that no unexpected characters are mixed in before embedding them directly into a SQL string
function assertSafeIdentifier(id: string): void {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
		throw new Error(`Invalid identifier: ${id}`);
	}
}

// mysql2's `createConnection(uri)` overload can't be combined with object-form options (disableEval, etc.),
// so when a URI string is passed we parse it ourselves and normalize it into ConnectionOptions
// (this normalization is needed because Hyperdrive's local dev mode (localConnectionString) always
// hands us a connectionString-style value even when the actual connection is MySQL)
function parseMysqlConnectionString(uri: string): ConnectionOptions {
	const url = new URL(uri);
	return {
		host: url.hostname,
		port: url.port ? Number(url.port) : 3306,
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
		database: url.pathname.replace(/^\//, '')
	};
}

/**
 * MySQL driver based on `mysql2`. It plays the same role as `pg-driver.ts`, but is implemented
 * separately because the placeholder syntax (`?`), identifier quoting (backticks), and client API
 * (`query()` returns `[rows, fields]`) differ from Postgres.
 *
 * `disableEval: true` is required on Cloudflare Workers (mysql2 uses `eval()` by default for
 * row-parsing optimization, which isn't allowed in the Workers sandbox).
 */
export function createMysqlDriver(clientConfig: string | ConnectionOptions): DbConnectionDriver {
	const baseConfig = typeof clientConfig === 'string' ? parseMysqlConnectionString(clientConfig) : clientConfig;
	let connection: Connection | null = null;

	async function ensureConnected(): Promise<Connection> {
		if (!connection) {
			// dateStrings: by default mysql2 interprets date/datetime columns in the process's local
			// timezone and converts them to Date objects, so for the same reason as pg-driver.ts we set
			// this to true and receive the raw string instead
			connection = await createConnection({ ...baseConfig, disableEval: true, dateStrings: true });
		}
		return connection;
	}

	return {
		engine: 'mysql',

		async listTables(): Promise<ExternalTableRef[]> {
			const conn = await ensureConnected();
			// information_schema's system views naturally use uppercase column names (TABLE_SCHEMA, etc.),
			// so without an explicit AS lowercase alias, the result set's keys would come back uppercase and be unreferenceable
			type Row = RowDataPacket & { table_schema: string; table_name: string };
			const [rows] = await conn.query<Row[]>(
				`SELECT table_schema AS table_schema, table_name AS table_name FROM information_schema.tables
				 WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
				 ORDER BY table_schema, table_name`
			);
			return rows.map((r) => ({ schema: r.table_schema, name: r.table_name }));
		},

		async listColumns(table: ExternalTableRef): Promise<ExternalColumn[]> {
			const conn = await ensureConnected();
			type Row = RowDataPacket & { column_name: string; data_type: string };
			const [rows] = await conn.query<Row[]>(
				`SELECT column_name AS column_name, data_type AS data_type FROM information_schema.columns
				 WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`,
				[table.schema, table.name]
			);
			return rows.map((r) => ({ name: r.column_name, dataType: r.data_type }));
		},

		async fetchRows(
			table: ExternalTableRef,
			columns: string[],
			offset: number,
			limit: number
		): Promise<Record<string, unknown>[]> {
			const conn = await ensureConnected();
			assertSafeIdentifier(table.schema);
			assertSafeIdentifier(table.name);
			columns.forEach(assertSafeIdentifier);
			const colList = columns.map((c) => `\`${c}\``).join(', ');
			const sql = `SELECT ${colList} FROM \`${table.schema}\`.\`${table.name}\` LIMIT ? OFFSET ?`;
			const [rows] = await conn.query(sql, [limit, offset]);
			return rows as Record<string, unknown>[];
		},

		async close(): Promise<void> {
			if (connection) await connection.end();
		}
	};
}
