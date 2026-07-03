// 外部DB接続の抽象化。provider（hyperdrive/tcp_socket）× engine（postgres/mysql）の組み合わせを
// 同じインターフェースで扱う。将来 http_api（Supabase REST等）を追加する際もこれに合わせる想定。

export type ExternalTableRef = {
	schema: string;
	name: string;
};

export type ExternalColumn = {
	name: string;
	/** ドライバ側の生の型名（例: Postgres/MySQLの information_schema.columns.data_type） */
	dataType: string;
};

export interface DbConnectionDriver {
	/** 列の型マッピング（column-mapping.ts）をPostgres/MySQLどちらの方言で行うか呼び出し側が判断するための情報 */
	engine: 'postgres' | 'mysql';
	listTables(): Promise<ExternalTableRef[]>;
	listColumns(table: ExternalTableRef): Promise<ExternalColumn[]>;
	fetchRows(
		table: ExternalTableRef,
		columns: string[],
		offset: number,
		limit: number
	): Promise<Record<string, unknown>[]>;
	/** 接続を明示的に閉じる。呼び出し側は必ず finally で呼ぶこと */
	close(): Promise<void>;
}
