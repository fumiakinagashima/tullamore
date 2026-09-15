import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { createDb } from '$lib/server/db';
import { listDbConnections, getDbConnection, createDbConnection } from '$lib/server/db/db-connection-service';
import { listAvailableHyperdriveBindings } from '$lib/server/db-connections/hyperdrive';
import { maskAuthConfig } from '$lib/server/db/integration-service';
import { errors } from '$lib/server/errors';

const hyperdriveSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	provider: z.literal('hyperdrive'),
	config: z.object({ bindingName: z.string().min(1) })
});

const tcpSocketSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	provider: z.literal('tcp_socket'),
	config: z.object({
		engine: z.enum(['postgres', 'mysql']).default('postgres'),
		host: z.string().min(1),
		port: z.coerce.number().int().min(1).max(65535),
		database: z.string().min(1),
		username: z.string().min(1),
		password: z.string().min(1),
		ssl: z.boolean().default(true)
	})
});

const createSchema = z.discriminatedUnion('provider', [hyperdriveSchema, tcpSocketSchema]);

export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const rows = await listDbConnections(db);
	return json(rows.map((r) => ({ ...r, config: maskAuthConfig(JSON.parse(r.config)) })));
};

export const POST: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const body = createSchema.parse(await request.json());

	if (body.provider === 'hyperdrive') {
		const available = listAvailableHyperdriveBindings(platform.env as Record<string, unknown>);
		if (!available.includes(body.config.bindingName)) {
			return errors.badRequest(
				`Binding "${body.config.bindingName}" was not found. Check the registration in wrangler.toml`
			);
		}
	}

	const db = createDb(platform.env.DB);
	// Hyperdrive binding names are unique, so we use the binding name itself as the id (other providers get a random UUID).
	// This way, disabling and re-enabling a connection revives the same row id, so the ingestion source display and
	// resync via external_table_syncs.dbConnectionId stay linked to their pre-disable state (a changing id would break the link)
	const id = body.provider === 'hyperdrive' ? body.config.bindingName : crypto.randomUUID();

	const existing = await getDbConnection(db, id);
	if (existing) {
		// Already enabled (duplicate request for the same binding). Return the existing row idempotently
		return json({ ...existing, config: maskAuthConfig(JSON.parse(existing.config)) });
	}

	const row = await createDbConnection(db, {
		id,
		name: body.name,
		description: body.description ?? null,
		provider: body.provider,
		config: JSON.stringify(body.config)
	});
	return json({ ...row, config: maskAuthConfig(JSON.parse(row.config)) }, { status: 201 });
};
