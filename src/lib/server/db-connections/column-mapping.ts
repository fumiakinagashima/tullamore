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

const MYSQL_NUMBER_TYPES = /^(tinyint|smallint|mediumint|int|bigint|decimal|numeric|float|double|bit|year)$/i;
const MYSQL_DATE_TYPES = /^(date|datetime|timestamp|time)$/i;

/**
 * MySQLの information_schema.columns.data_type を Tullamoreの4種類の列型に変換する。
 * MySQLのBOOLEAN/BOOLはTINYINT(1)の別名で、data_type上は単なる'tinyint'としか返らず
 * 通常のtinyint列と区別できないため、boolean判定は行わずnumberとして扱う（既知の制約）
 */
export function mapMysqlTypeToColumnType(mysqlType: string): ColumnDef['type'] {
	if (MYSQL_DATE_TYPES.test(mysqlType)) return 'date';
	if (MYSQL_NUMBER_TYPES.test(mysqlType)) return 'number';
	return 'text';
}

/** 外部DBの列名を isValidColumnKey（英字始まり・英数字とアンダースコアのみ）を満たす形に変換する */
export function sanitizeColumnKey(name: string): string {
	let key = name.replace(/[^a-zA-Z0-9_]/g, '_');
	if (!/^[a-zA-Z]/.test(key)) key = `c_${key}`;
	return key;
}
