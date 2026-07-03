import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod/v4';
import { createDb } from '$lib/server/db';
import { listDbConnections, getDbConnection, createDbConnection } from '$lib/server/db/db-connection-service';
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
	// hyperdriveはバインディング名が一意なので、それをそのままidに使う（provider追加時はランダムUUIDにフォールバック）。
	// こうすることで「無効化→再度有効化」で同じidの行が復活し、external_table_syncs.dbConnectionId経由の
	// 取り込み元表示・再同期が無効化前の状態のまま繋がり続ける（idが毎回変わると紐付けが切れてしまう）
	const id = body.provider === 'hyperdrive' ? body.config.bindingName : crypto.randomUUID();

	const existing = await getDbConnection(db, id);
	if (existing) {
		// 既に有効化済み（同じbindingへの重複リクエスト）。冪等に既存行を返す
		return json({ ...existing, config: JSON.parse(existing.config) });
	}

	const row = await createDbConnection(db, {
		id,
		name: body.name,
		description: body.description ?? null,
		provider: body.provider,
		config: JSON.stringify(body.config)
	});
	return json({ ...row, config: JSON.parse(row.config) }, { status: 201 });
};
