import type { DbConnectionDriver } from './types';
import { createPgDriver } from './pg-driver';
import { createMysqlDriver } from './mysql-driver';

type HyperdriveConnectionStringBinding = { connectionString: string };
type HyperdriveMysqlObjectBinding = { host: string; port: number; user: string; password: string; database: string };
type HyperdriveBinding = HyperdriveConnectionStringBinding | HyperdriveMysqlObjectBinding;

// A real Hyperdrive binding in production exposes connectionString for Postgres, but for MySQL
// exposes host/port/user/password/database directly instead of connectionString (this follows
// Cloudflare's official Hyperdrive type definitions). On the other hand, `wrangler dev`'s local
// dev mode (localConnectionString) always passes things in connectionString form even when the
// target is MySQL, so in that case we determine the engine from the scheme (postgres:// / mysql://)
function isConnectionStringBinding(value: unknown): value is HyperdriveConnectionStringBinding {
	return !!value && typeof value === 'object' && typeof (value as HyperdriveConnectionStringBinding).connectionString === 'string';
}

function isHyperdriveMysqlObjectBinding(value: unknown): value is HyperdriveMysqlObjectBinding {
	if (!value || typeof value !== 'object' || isConnectionStringBinding(value)) return false;
	const v = value as HyperdriveMysqlObjectBinding;
	return typeof v.host === 'string' && typeof v.port === 'number' && typeof v.user === 'string';
}

function isHyperdriveBinding(value: unknown): value is HyperdriveBinding {
	return isConnectionStringBinding(value) || isHyperdriveMysqlObjectBinding(value);
}

/**
 * Scans bindings whose name starts with `HYPERDRIVE_` at runtime and lists them.
 * Since Hyperdrive bindings are static (they must be pre-registered in wrangler.toml and require
 * a redeploy), we don't keep a hardcoded list of binding names in the code and instead reflect
 * whatever is actually deployed (adding a new binding to wrangler.toml makes it appear here
 * automatically).
 */
export function listAvailableHyperdriveBindings(env: Record<string, unknown>): string[] {
	return Object.keys(env)
		.filter((key) => key.startsWith('HYPERDRIVE_') && isHyperdriveBinding(env[key]))
		.sort();
}

/** Helper for showing an engine badge in the /connections list */
export function getHyperdriveBindingEngine(env: Record<string, unknown>, bindingName: string): 'postgres' | 'mysql' | null {
	const binding = env[bindingName];
	if (isConnectionStringBinding(binding)) {
		return /^mysql:/i.test(binding.connectionString) ? 'mysql' : 'postgres';
	}
	if (isHyperdriveMysqlObjectBinding(binding)) return 'mysql';
	return null;
}

/** Creates a driver for the given Hyperdrive binding. Query logic is shared in pg-driver.ts/mysql-driver.ts */
export function createHyperdriveDriver(env: Record<string, unknown>, bindingName: string): DbConnectionDriver {
	const binding = env[bindingName];
	if (isConnectionStringBinding(binding)) {
		return /^mysql:/i.test(binding.connectionString)
			? createMysqlDriver(binding.connectionString)
			: createPgDriver({ connectionString: binding.connectionString });
	}
	if (isHyperdriveMysqlObjectBinding(binding)) {
		return createMysqlDriver({
			host: binding.host,
			port: binding.port,
			user: binding.user,
			password: binding.password,
			database: binding.database
		});
	}
	throw new Error(`Hyperdrive binding "${bindingName}" was not found`);
}
