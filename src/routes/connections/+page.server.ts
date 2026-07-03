import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { listDbConnections } from '$lib/server/db/db-connection-service';
import { listAvailableHyperdriveBindings } from '$lib/server/db-connections/hyperdrive';

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = createDb(platform!.env.DB);
	const rows = await listDbConnections(db);
	const availableBindings = listAvailableHyperdriveBindings(platform!.env as unknown as Record<string, unknown>);

	// wrangler.tomlに登録済みの全バインディングを一覧化し、既にdb_connections行があるものは
	// 「有効」として扱う（行の有無=トグルのON/OFF。行が無いバインディングは未登録＝OFF表示）
	const items = availableBindings.map((bindingName) => {
		const connection = rows.find((r) => (JSON.parse(r.config) as { bindingName?: string }).bindingName === bindingName);
		return {
			bindingName,
			connectionId: connection?.id ?? null,
			name: connection?.name ?? bindingName,
			enabled: !!connection
		};
	});

	return { account: locals.account!, items };
};
