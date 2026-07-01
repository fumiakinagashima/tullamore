import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// 動的にサーバー定義のフィールドを組み立てるツール用フォームエンドポイント（現在は登録ツールなし）。
export const GET: RequestHandler = async () => {
	return json({ error: 'Not found' }, { status: 404 });
};
