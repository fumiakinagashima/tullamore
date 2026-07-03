import type { DbConnectionDriver } from './types';
import { createHyperdriveDriver } from './hyperdrive';

// provider は db_connections.provider の enum と一致させる。将来 'tcp_socket' | 'http_api' を追加する際は
// ここに実装を足すだけでよい設計（現状は 'hyperdrive' のみ実装）
export type DbConnectionProvider = 'hyperdrive';

export type DbConnectionConfig = {
	/** hyperdrive の場合のみ使用: env.HYPERDRIVE_* のバインディング名 */
	bindingName?: string;
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
		default:
			throw new Error(`未対応のproviderです: ${provider}`);
	}
}
