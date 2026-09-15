// Abstraction for external DB connections. Handles combinations of provider (hyperdrive/tcp_socket)
// x engine (postgres/mysql) through the same interface. Any future http_api (Supabase REST, etc.)
// addition is expected to follow this same shape.

export type ExternalTableRef = {
	schema: string;
	name: string;
};

export type ExternalColumn = {
	name: string;
	/** The raw type name from the driver (e.g. information_schema.columns.data_type in Postgres/MySQL) */
	dataType: string;
};

export interface DbConnectionDriver {
	/** Tells the caller which dialect (Postgres/MySQL) to use for column type mapping (column-mapping.ts) */
	engine: 'postgres' | 'mysql';
	listTables(): Promise<ExternalTableRef[]>;
	listColumns(table: ExternalTableRef): Promise<ExternalColumn[]>;
	fetchRows(
		table: ExternalTableRef,
		columns: string[],
		offset: number,
		limit: number
	): Promise<Record<string, unknown>[]>;
	/** Explicitly closes the connection. Callers must always invoke this in a finally block */
	close(): Promise<void>;
}
