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
				`バインディング「${body.config.bindingName}」が見つかりません。wrangler.tomlの登録内容を確認してください`
			);
		}
	}

	const db = createDb(platform.env.DB);
	// hyperdriveはバインディング名が一意なので、それをそのままidに使う（他のproviderはランダムUUID）。
	// こうすることで「無効化→再度有効化」で同じidの行が復活し、external_table_syncs.dbConnectionId経由の
	// 取り込み元表示・再同期が無効化前の状態のまま繋がり続ける（idが毎回変わると紐付けが切れてしまう）
	const id = body.provider === 'hyperdrive' ? body.config.bindingName : crypto.randomUUID();

	const existing = await getDbConnection(db, id);
	if (existing) {
		// 既に有効化済み（同じbindingへの重複リクエスト）。冪等に既存行を返す
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
