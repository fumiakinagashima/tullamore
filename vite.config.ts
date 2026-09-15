/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
	plugins: [
		paraglide({ project: './project.inlang', outdir: './src/lib/paraglide' }),
		sveltekit()
	],
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		// *.workers.test.ts targets a separate pool that needs cloudflare:test (the Workers runtime on
		// Miniflare), and is run from vitest.workers.config.ts (tests for server functions that need D1 and other bindings)
		exclude: [...configDefaults.exclude, 'src/**/*.workers.test.ts']
	}
});
