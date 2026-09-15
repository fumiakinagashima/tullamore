import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
	// SvelteKit's `$lib` alias is normally provided by the `sveltekit()` vite plugin, but this
	// config deliberately avoids the SvelteKit plugin to prevent conflicts with worker.ts's bundle.
	// The server modules under test include `$lib/...` imports, so we set up the same resolution manually.
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, 'src/lib')
		}
	},
	plugins: [
		cloudflareTest(async () => {
			const migrations = await readD1Migrations('./drizzle');
			return {
				wrangler: { configPath: './wrangler.test.toml' },
				miniflare: {
					bindings: { TEST_MIGRATIONS: migrations }
				}
			};
		})
	],
	test: {
		pool: '@cloudflare/vitest-pool-workers',
		setupFiles: ['./src/lib/server/test-setup/apply-d1-migrations.ts'],
		include: ['src/**/*.workers.test.ts']
	}
});
