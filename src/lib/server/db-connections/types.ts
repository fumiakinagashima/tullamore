// 外部DB接続の抽象化。今回は Hyperdrive（Postgres）のみ実装するが、
// 将来 tcp_socket（動的接続）・http_api（Supabase REST等）を追加する際もこのインターフェースに合わせる想定。

export type ExternalTableRef = {
	schema: string;
	name: string;
};

export type ExternalColumn = {
	name: string;
	/** ドライバ側の生の型名（例: Postgresの information_schema.columns.data_type） */
	dataType: string;
};

export interface DbConnectionDriver {
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
