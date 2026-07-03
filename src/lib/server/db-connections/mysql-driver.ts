import { createConnection, type Connection, type ConnectionOptions, type RowDataPacket } from 'mysql2/promise';
import type { DbConnectionDriver, ExternalColumn, ExternalTableRef } from './types';

// 識別子（スキーマ名・テーブル名・列名）は必ず information_schema から取得した値のみを渡す想定。
// SQL文字列に直接埋め込む前に、想定外の文字が混ざっていないか防御的に検証する
function assertSafeIdentifier(id: string): void {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
		throw new Error(`不正な識別子です: ${id}`);
	}
}

// mysql2の`createConnection(uri)`オーバーロードはオブジェクト形式のオプション（disableEval等）を
// 併用できないため、URI文字列で渡された場合は自前でパースしてConnectionOptionsに正規化する
// （Hyperdriveのローカル開発モード（localConnectionString）は、実際の接続がMySQLでも
// connectionString形式で渡ってくるため、この正規化が必要）
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
 * `mysql2`ベースのMySQLドライバ。`pg-driver.ts`と役割は同じだが、プレースホルダ記法（`?`）・
 * 識別子クォート（バッククォート）・クライアントAPI（`query()`が`[rows, fields]`を返す）が
 * Postgresと異なるため別実装にしている。
 *
 * `disableEval: true` は Cloudflare Workers 上で必須（mysql2はデフォルトで行パース最適化に
 * `eval()` を使うが、Workersのサンドボックスでは許可されないため）。
 */
export function createMysqlDriver(clientConfig: string | ConnectionOptions): DbConnectionDriver {
	const baseConfig = typeof clientConfig === 'string' ? parseMysqlConnectionString(clientConfig) : clientConfig;
	let connection: Connection | null = null;

	async function ensureConnected(): Promise<Connection> {
		if (!connection) {
			// dateStrings: mysql2はデフォルトでdate/datetime列をプロセスのローカルタイムゾーンで
			// 解釈してDateオブジェクトに変換するため、pg-driver.tsと同じ理由でtrueにして生の文字列で受け取る
			connection = await createConnection({ ...baseConfig, disableEval: true, dateStrings: true });
		}
		return connection;
	}

	return {
		engine: 'mysql',

		async listTables(): Promise<ExternalTableRef[]> {
			const conn = await ensureConnected();
			// information_schemaのシステムビューは列名が本来大文字（TABLE_SCHEMA等）のため、
			// 明示的にASで小文字エイリアスを付けないと結果セットのキーが大文字になり参照できない
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
