import type { DbConnectionDriver } from './types';
import { createHyperdriveDriver } from './hyperdrive';
import { createTcpSocketDriver } from './tcp-socket';

// provider must match the enum for db_connections.provider. When adding 'http_api' in the future,
// this is designed so you only need to add the implementation here
export type DbConnectionProvider = 'hyperdrive' | 'tcp_socket';

export type DbConnectionConfig = {
	/** Used only for hyperdrive: the env.HYPERDRIVE_* binding name (the engine is auto-detected from the binding's shape) */
	bindingName?: string;
	/** Used only for tcp_socket: connection info for the directly connected DB */
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
			if (!config.bindingName) throw new Error('bindingName is not configured');
			return createHyperdriveDriver(env, config.bindingName);
		}
		case 'tcp_socket': {
			if (!config.host || !config.port || !config.database || !config.username) {
				throw new Error('host/port/database/username is not configured');
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
			throw new Error(`Unsupported provider: ${provider}`);
	}
}
