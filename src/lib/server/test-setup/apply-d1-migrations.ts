import { applyD1Migrations, env } from 'cloudflare:test';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

// This project does not run wrangler types (App.Platform.env is hand-written; see src/app.d.ts),
// so `Cloudflare.Env` remains the empty, extensible interface provided by @cloudflare/workers-types.
// The env from cloudflare:test refers to this type, so the test bindings are added here.
declare global {
	namespace Cloudflare {
		interface Env {
			DB: D1Database;
			TEST_MIGRATIONS: D1Migration[];
		}
	}
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
