import type { DbConnectionDriver } from './types';
import { createHyperdriveDriver } from './hyperdrive';
import { createTcpSocketDriver } from './tcp-socket';

// provider は db_connections.provider の enum と一致させる。将来 'http_api' を追加する際は
// ここに実装を足すだけでよい設計
export type DbConnectionProvider = 'hyperdrive' | 'tcp_socket';

export type DbConnectionConfig = {
	/** hyperdrive の場合のみ使用: env.HYPERDRIVE_* のバインディング名（エンジンはバインディングの形から自動判別する） */
	bindingName?: string;
	/** tcp_socket の場合のみ使用: 直接接続するDBの接続情報 */
	engine?: 'postgres' | 'mysql';
	host?: string;
	port?: number;
	database?: string;
	username?: string;
	password?: string;
	ssl?: boolean;
};

export function getDriver(
	provider: DbConnectionProvider,
	config: DbConnectionConfig,
	env: Record<string, unknown>
): DbConnectionDriver {
	switch (provider) {
		case 'hyperdrive': {
			if (!config.bindingName) throw new Error('bindingNameが設定されていません');
			return createHyperdriveDriver(env, config.bindingName);
		}
		case 'tcp_socket': {
			if (!config.host || !config.port || !config.database || !config.username) {
				throw new Error('host/port/database/usernameが設定されていません');
			}
			return createTcpSocketDriver({
				engine: config.engine ?? 'postgres',
				host: config.host,
				port: config.port,
				database: config.database,
				username: config.username,
				password: config.password ?? '',
				ssl: config.ssl ?? true
			});
		}
		default:
			throw new Error(`未対応のproviderです: ${provider}`);
	}
}
