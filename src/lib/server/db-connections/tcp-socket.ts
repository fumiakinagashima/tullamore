import type { DbConnectionDriver } from './types';
import { createPgDriver } from './pg-driver';
import { createMysqlDriver } from './mysql-driver';

export type TcpSocketConfig = {
	engine: 'postgres' | 'mysql';
	host: string;
	port: number;
	database: string;
	username: string;
	password: string;
	ssl: boolean;
};

/**
 * `pg`/`mysql2`は内部でNode標準の `net`/`tls` を使うだけで、Hyperdrive固有のAPIには依存しない。
 * Cloudflare Workers（`nodejs_compat`）ではこの `net`/`tls` が `cloudflare:sockets` 経由で
 * 動作するため、Hyperdriveのような静的バインディングの事前登録なしに、フォームで入力した
 * 任意のPostgres/MySQL接続情報でそのまま接続できる。
 *
 * `ssl: { rejectUnauthorized: false }` はRDS/Supabase等の管理DBが提示する証明書を
 * Node標準のCAバンドルで検証できないケースが多いための実用上の妥協。中間者攻撃に対する
 * 保証は弱まる（docs/DATA_CONNECTIONS.md 参照）。
 */
export function createTcpSocketDriver(config: TcpSocketConfig): DbConnectionDriver {
	if (config.engine === 'mysql') {
		return createMysqlDriver({
			host: config.host,
			port: config.port,
			database: config.database,
			user: config.username,
			password: config.password,
			ssl: config.ssl ? { rejectUnauthorized: false } : undefined
		});
	}
	return createPgDriver({
		host: config.host,
		port: config.port,
		database: config.database,
		user: config.username,
		password: config.password,
		ssl: config.ssl ? { rejectUnauthorized: false } : false
	});
}
