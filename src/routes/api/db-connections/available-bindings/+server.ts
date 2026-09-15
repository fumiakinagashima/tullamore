import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAvailableHyperdriveBindings } from '$lib/server/db-connections/hyperdrive';
import { errors } from '$lib/server/errors';

// Used for the binding options in the connection creation form. Scans and returns the
// HYPERDRIVE_* bindings registered in wrangler.toml at runtime (no hardcoded list in the code)
export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env) return errors.serviceUnavailable();
	const bindings = listAvailableHyperdriveBindings(platform.env as Record<string, unknown>);
	return json({ bindings });
};
