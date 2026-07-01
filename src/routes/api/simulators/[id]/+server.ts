import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/server/db';
import { getSimulator, deleteSimulator } from '$lib/server/db/simulator-service';
import { errors } from '$lib/server/errors';

export const DELETE: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env?.DB) return errors.serviceUnavailable();
	const db = createDb(platform.env.DB);
	const simulator = await getSimulator(db, params.id);
	if (!simulator) return errors.notFound('シミュレーターが見つかりません');

	await deleteSimulator(db, params.id);
	return json({ ok: true });
};
