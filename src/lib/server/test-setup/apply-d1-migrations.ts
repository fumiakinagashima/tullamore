import { applyD1Migrations, env } from 'cloudflare:test';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

// このプロジェクトは wrangler types を実行しておらず（App.Platform.env を手書きしている、src/app.d.ts参照）、
// `Cloudflare.Env` は @cloudflare/workers-types が提供する空の拡張可能インターフェースのまま。
// cloudflare:test の env はこの型を参照するため、テスト用バインディングをここで追加しておく。
declare global {
	namespace Cloudflare {
		interface Env {
			DB: D1Database;
			TEST_MIGRATIONS: D1Migration[];
		}
	}
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
