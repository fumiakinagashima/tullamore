import type { ColumnDef } from '$lib/server/db/data-source-service';

const NUMBER_TYPES =
	/^(smallint|integer|bigint|decimal|numeric|real|double precision|smallserial|serial|bigserial|money)$/i;
const BOOLEAN_TYPES = /^boolean$/i;
const DATE_TYPES =
	/^(date|timestamp|timestamp with time zone|timestamp without time zone|time|time with time zone|time without time zone)$/i;

/** Converts Postgres's information_schema.columns.data_type into Tullamore's four column types */
export function mapPgTypeToColumnType(pgType: string): ColumnDef['type'] {
	if (BOOLEAN_TYPES.test(pgType)) return 'boolean';
	if (NUMBER_TYPES.test(pgType)) return 'number';
	if (DATE_TYPES.test(pgType)) return 'date';
	return 'text';
}

const MYSQL_NUMBER_TYPES = /^(tinyint|smallint|mediumint|int|bigint|decimal|numeric|float|double|bit|year)$/i;
const MYSQL_DATE_TYPES = /^(date|datetime|timestamp|time)$/i;

/**
 * Converts MySQL's information_schema.columns.data_type into Tullamore's four column types.
 * MySQL's BOOLEAN/BOOL is just an alias for TINYINT(1) — data_type reports it as plain 'tinyint',
 * indistinguishable from a regular tinyint column, so we don't attempt boolean detection and treat it as number (a known limitation)
 */
export function mapMysqlTypeToColumnType(mysqlType: string): ColumnDef['type'] {
	if (MYSQL_DATE_TYPES.test(mysqlType)) return 'date';
	if (MYSQL_NUMBER_TYPES.test(mysqlType)) return 'number';
	return 'text';
}

/** Converts an external DB column name into a form that satisfies isValidColumnKey (starts with a letter, letters/digits/underscore only) */
export function sanitizeColumnKey(name: string): string {
	let key = name.replace(/[^a-zA-Z0-9_]/g, '_');
	if (!/^[a-zA-Z]/.test(key)) key = `c_${key}`;
	return key;
}
