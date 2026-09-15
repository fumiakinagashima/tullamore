import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { createDb } from '$lib/server/db';
import { getDbConnection } from '$lib/server/db/db-connection-service';
import { maskAuthConfig } from '$lib/server/db/integration-service';

type ImportColumn = {
	externalName: string;
	dataType: string;
	key: string;
	label: string;
	type: 'text' | 'number' | 'date' | 'boolean';
};

type ImportTable = { schema: string; name: string; columns: ImportColumn[] };

export const load: PageServerLoad = async ({ params, platform, locals, fetch }) => {
	const db = createDb(platform!.env.DB);
	const connection = await getDbConnection(db, params.id);
	if (!connection) throw error(404, 'Connection not found');

	let tables: ImportTable[] = [];
	let tablesError = '';
	try {
		const res = await fetch(`/api/db-connections/${params.id}/tables`);
		const body = (await res.json()) as { tables?: ImportTable[]; error?: string };
		if (!res.ok) {
			tablesError = body.error ?? 'Failed to retrieve the table list';
		} else {
			tables = body.tables ?? [];
		}
	} catch (e) {
		tablesError = e instanceof Error ? e.message : String(e);
	}

	const config = maskAuthConfig(JSON.parse(connection.config)) as {
		bindingName?: string;
		host?: string;
		port?: number;
		database?: string;
	};

	return {
		account: locals.account!,
		connection: { ...connection, config },
		tables,
		tablesError
	};
};
