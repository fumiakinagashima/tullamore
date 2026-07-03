import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { createDb } from '$lib/server/db';
import { listDbConnections, createDbConnection } from '$lib/server/db/db-connection-service';
import { listAvailableHyperdriveBindings } from '$lib/server/db-connections/hyperdrive';
import { errors } from '$lib/server/errors';

const createSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	provider: z.literal('hyperdrive').default('hyperdrive'),
	config: z.object({ bindingName: z.string().min(1) })
});

export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const rows = await listDbConnections(db);
	return json(rows.map((r) => ({ ...r, config: JSON.parse(r.config) })));
};

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const body = createSchema.parse(await request.json());

	const available = listAvailableHyperdriveBindings(platform.env as Record<string, unknown>);
	if (!available.includes(body.config.bindingName)) {
		return errors.badRequest(
			`バインディング「${body.config.bindingName}」が見つかりません。wrangler.tomlの登録内容を確認してください`
		);
	}

	const db = createDb(platform.env.DB);
	const id = crypto.randomUUID();
	const row = await createDbConnection(db, {
		id,
		name: body.name,
		description: body.description ?? null,
		provider: body.provider,
		config: JSON.stringify(body.config)
	});
	return json({ ...row, config: JSON.parse(row.config) }, { status: 201 });
};
