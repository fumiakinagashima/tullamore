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
		// *.workers.test.ts は cloudflare:test（Miniflare上のWorkersランタイム）が要る別プール向けで、
		// vitest.workers.config.ts 側で実行する（D1等のバインディングが必要なserver関数のテスト）
		exclude: [...configDefaults.exclude, 'src/**/*.workers.test.ts']
	}
});
