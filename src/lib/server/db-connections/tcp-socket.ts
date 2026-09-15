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
 * `pg`/`mysql2` only use Node's standard `net`/`tls` internally and don't depend on any
 * Hyperdrive-specific API. On Cloudflare Workers (`nodejs_compat`), this `net`/`tls` works via
 * `cloudflare:sockets`, which lets us connect directly using whatever Postgres/MySQL connection info
 * was entered in the form, without pre-registering a static binding like Hyperdrive requires.
 *
 * `ssl: { rejectUnauthorized: false }` is a practical compromise because Node's standard CA bundle
 * often can't verify the certificates presented by managed databases like RDS/Supabase. This weakens
 * protection against man-in-the-middle attacks (see docs/DATA_CONNECTIONS.md).
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
