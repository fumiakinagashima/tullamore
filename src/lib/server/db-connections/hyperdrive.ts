import { Client } from 'pg';
import type { DbConnectionDriver, ExternalColumn, ExternalTableRef } from './types';

type HyperdriveBinding = { connectionString: string };

function isHyperdriveBinding(value: unknown): value is HyperdriveBinding {
	return !!value && typeof value === 'object' && typeof (value as HyperdriveBinding).connectionString === 'string';
}

/**
 * `HYPERDRIVE_`で始まる名前のバインディングを実行時にスキャンして一覧化する。
 * Hyperdriveはバインディングが静的（wrangler.tomlに事前登録・再デプロイが必要）なため、
 * コード側にバインディング名のハードコードされた一覧は持たず、実際にデプロイされている構成を
 * そのまま反映する（wrangler.tomlに新しいバインディングを追加すればここに自動で現れる）。
 */
export function listAvailableHyperdriveBindings(env: Record<string, unknown>): string[] {
	return Object.keys(env)
		.filter((key) => key.startsWith('HYPERDRIVE_') && isHyperdriveBinding(env[key]))
		.sort();
}

// 識別子（スキーマ名・テーブル名・列名）は必ず information_schema から取得した値のみを渡す想定。
// SQL文字列に直接埋め込む前に、想定外の文字が混ざっていないか防御的に検証する
function assertSafeIdentifier(id: string): void {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
		throw new Error(`不正な識別子です: ${id}`);
	}
}

/**
 * 指定したHyperdriveバインディングに対するドライバを作成する。
 * 接続は最初のクエリ時に一度だけ張り、以降の呼び出しで使い回す（Hyperdrive側でプーリングされるため、
 * テーブル一覧取得→カラム取得→行取得のような一連の操作をまとめて1接続で行うのが効率的）。
 * 呼び出し側は必ず finally で close() を呼ぶこと。
 */
export function createHyperdriveDriver(env: Record<string, unknown>, bindingName: string): DbConnectionDriver {
	const binding = env[bindingName];
	if (!isHyperdriveBinding(binding)) {
		throw new Error(`Hyperdriveバインディング「${bindingName}」が見つかりません`);
	}

	const client = new Client({ connectionString: binding.connectionString });
	let connected = false;

	async function ensureConnected(): Promise<void> {
		if (!connected) {
			await client.connect();
			connected = true;
		}
	}

	return {
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
