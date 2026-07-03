import type { DbConnectionDriver } from './types';
import { createPgDriver } from './pg-driver';
import { createMysqlDriver } from './mysql-driver';

type HyperdriveConnectionStringBinding = { connectionString: string };
type HyperdriveMysqlObjectBinding = { host: string; port: number; user: string; password: string; database: string };
type HyperdriveBinding = HyperdriveConnectionStringBinding | HyperdriveMysqlObjectBinding;

// 本番の実Hyperdriveバインディングは、PostgresならconnectionStringを、MySQLならconnectionStringを
// 持たずhost/port/user/password/databaseを直接公開する（Cloudflare公式ドキュメントのHyperdrive型定義準拠）。
// 一方 `wrangler dev` のローカル開発モード（localConnectionString）は、接続先がMySQLでも
// 常にconnectionString形式で渡ってくるため、その場合はスキーム（postgres:// / mysql://）で判定する
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
 * `HYPERDRIVE_`で始まる名前のバインディングを実行時にスキャンして一覧化する。
 * Hyperdriveはバインディングが静的（wrangler.tomlに事前登録・再デプロイが必要）なため、
 * コード側にバインディング名のハードコードされた一覧は持たず、実際にデプロイされている構成を
 * そのまま反映する（wrangler.tomlに新しいバインディングを追加すればここに自動で現れる）。
 */
export function listAvailableHyperdriveBindings(env: Record<string, unknown>): string[] {
	return Object.keys(env)
		.filter((key) => key.startsWith('HYPERDRIVE_') && isHyperdriveBinding(env[key]))
		.sort();
}

/** /connections の一覧にエンジンバッジを出すためのヘルパー */
export function getHyperdriveBindingEngine(env: Record<string, unknown>, bindingName: string): 'postgres' | 'mysql' | null {
	const binding = env[bindingName];
	if (isConnectionStringBinding(binding)) {
		return /^mysql:/i.test(binding.connectionString) ? 'mysql' : 'postgres';
	}
	if (isHyperdriveMysqlObjectBinding(binding)) return 'mysql';
	return null;
}

/** 指定したHyperdriveバインディングに対するドライバを作成する。クエリロジックはpg-driver.ts/mysql-driver.tsに共通化されている */
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
	throw new Error(`Hyperdriveバインディング「${bindingName}」が見つかりません`);
}
