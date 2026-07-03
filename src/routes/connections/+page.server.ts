import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { listDbConnections } from '$lib/server/db/db-connection-service';
import { listAvailableHyperdriveBindings, getHyperdriveBindingEngine } from '$lib/server/db-connections/hyperdrive';
import { maskAuthConfig } from '$lib/server/db/integration-service';

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = createDb(platform!.env.DB);
	const rows = await listDbConnections(db);
	const env = platform!.env as unknown as Record<string, unknown>;
	const availableBindings = listAvailableHyperdriveBindings(env);

	// wrangler.tomlに登録済みの全バインディングを一覧化し、既にdb_connections行があるものは
	// 「有効」として扱う（行の有無=トグルのON/OFF。行が無いバインディングは未登録＝OFF表示）
	const hyperdriveItems = availableBindings.map((bindingName) => {
		const connection = rows.find(
			(r) => r.provider === 'hyperdrive' && (JSON.parse(r.config) as { bindingName?: string }).bindingName === bindingName
		);
		return {
			bindingName,
			connectionId: connection?.id ?? null,
			name: connection?.name ?? bindingName,
			enabled: !!connection,
			engine: getHyperdriveBindingEngine(env, bindingName)
		};
	});

	// tcp_socket接続は自動検出できないため、db_connectionsに登録済みのものをそのまま一覧化する
	const tcpItems = rows
		.filter((r) => r.provider === 'tcp_socket')
		.map((r) => ({
			id: r.id,
			name: r.name,
			description: r.description,
			config: maskAuthConfig(JSON.parse(r.config)) as {
				engine: 'postgres' | 'mysql';
				host: string;
				port: number;
				database: string;
				username: string;
				password: string;
				ssl: boolean;
			}
		}));

	return { account: locals.account!, hyperdriveItems, tcpItems };
};
