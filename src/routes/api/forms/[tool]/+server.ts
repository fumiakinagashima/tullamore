import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Form endpoint for tools that dynamically build server-defined fields (no tools registered currently).
export const GET: RequestHandler = async () => {
	return json({ error: 'Not found' }, { status: 404 });
};
