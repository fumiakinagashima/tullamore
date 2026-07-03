import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getDbConnection } from '$lib/server/db/db-connection-service';
import { getDriver, type DbConnectionProvider } from '$lib/server/db-connections/registry';
import { mapPgTypeToColumnType, mapMysqlTypeToColumnType, sanitizeColumnKey } from '$lib/server/db-connections/column-mapping';
import { errors } from '$lib/server/errors';

// 接続先のテーブル一覧・カラム一覧を返す（テーブル取り込みモーダルの選択肢に使う）
export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const connection = await getDbConnection(db, params.id);
	if (!connection) return errors.notFound();

	const config = JSON.parse(connection.config) as { bindingName?: string };
	const driver = getDriver(connection.provider as DbConnectionProvider, config, platform.env as Record<string, unknown>);

	const mapType = driver.engine === 'mysql' ? mapMysqlTypeToColumnType : mapPgTypeToColumnType;

	try {
		const tables = await driver.listTables();
		const withColumns = await Promise.all(
			tables.map(async (table) => {
				const columns = await driver.listColumns(table);
				return {
					schema: table.schema,
					name: table.name,
					columns: columns.map((c) => ({
						externalName: c.name,
						dataType: c.dataType,
						key: sanitizeColumnKey(c.name),
						label: c.name,
						type: mapType(c.dataType)
					}))
				};
			})
		);
		return json({ tables: withColumns });
	} catch (e) {
		return errors.badRequest(`接続に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
	} finally {
		await driver.close();
	}
};
