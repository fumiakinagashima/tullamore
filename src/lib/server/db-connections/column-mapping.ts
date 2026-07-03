import type { ColumnDef } from '$lib/server/db/data-source-service';

const NUMBER_TYPES =
	/^(smallint|integer|bigint|decimal|numeric|real|double precision|smallserial|serial|bigserial|money)$/i;
const BOOLEAN_TYPES = /^boolean$/i;
const DATE_TYPES =
	/^(date|timestamp|timestamp with time zone|timestamp without time zone|time|time with time zone|time without time zone)$/i;

/** Postgresの information_schema.columns.data_type を Tullamoreの4種類の列型に変換する */
export function mapPgTypeToColumnType(pgType: string): ColumnDef['type'] {
	if (BOOLEAN_TYPES.test(pgType)) return 'boolean';
	if (NUMBER_TYPES.test(pgType)) return 'number';
	if (DATE_TYPES.test(pgType)) return 'date';
	return 'text';
}

/** 外部DBの列名を isValidColumnKey（英字始まり・英数字とアンダースコアのみ）を満たす形に変換する */
export function sanitizeColumnKey(name: string): string {
	let key = name.replace(/[^a-zA-Z0-9_]/g, '_');
	if (!/^[a-zA-Z]/.test(key)) key = `c_${key}`;
	return key;
}
