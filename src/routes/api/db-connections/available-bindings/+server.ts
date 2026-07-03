import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAvailableHyperdriveBindings } from '$lib/server/db-connections/hyperdrive';
import { errors } from '$lib/server/errors';

// 接続作成フォームのバインディング選択肢に使う。wrangler.tomlに登録済みの HYPERDRIVE_* バインディングを
// 実行時にスキャンして返す（コード側にハードコードされた一覧は持たない）
export const GET: RequestHandler = async ({ platform }) => {
	if (!platform?.env) return errors.serviceUnavailable();
	const bindings = listAvailableHyperdriveBindings(platform.env as Record<string, unknown>);
	return json({ bindings });
};
