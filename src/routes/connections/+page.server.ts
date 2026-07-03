import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { listDbConnections } from '$lib/server/db/db-connection-service';
import { listAvailableHyperdriveBindings } from '$lib/server/db-connections/hyperdrive';

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = createDb(platform!.env.DB);
	const rows = await listDbConnections(db);
	const items = rows.map((r) => ({ ...r, config: JSON.parse(r.config) as { bindingName?: string } }));
	const availableBindings = listAvailableHyperdriveBindings(platform!.env as unknown as Record<string, unknown>);
	return { account: locals.account!, items, availableBindings };
};
