import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
	// SvelteKitの `$lib` エイリアスは `sveltekit()` vite プラグインが提供するが、
	// このconfigはworker.tsのバンドルと衝突を避けるため意図的にSvelteKit pluginを使わない。
	// テスト対象のserverモジュールは `$lib/...` importを含むため、同じ解決を手動で用意する。
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
