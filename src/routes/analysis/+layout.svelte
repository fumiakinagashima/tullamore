<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import Scatter from '$lib/components/icon/Scatter.svelte';
	import TrendingUp from '$lib/components/icon/TrendingUp.svelte';
	import type { LayoutData } from './$types';

	let { children }: { data: LayoutData; children: Snippet } = $props();

	const modules = [
		{
			href: '/analysis/regression',
			label: '回帰分析',
			desc: '変数を動かして目的変数への影響をシミュレーション',
			icon: Scatter
		},
		{
			href: '/analysis/trend',
			label: 'トレンド予測',
			desc: '時系列データから将来の推移を予測',
			icon: TrendingUp
		}
	];
</script>

<div class="workbench">
	<div class="analysis-main">
		{@render children()}
	</div>
	<aside class="analysis-sidebar">
		<div class="analysis-sidebar-header">
			<span class="analysis-sidebar-title">分析</span>
		</div>
		<div class="module-list">
			{#each modules as mod (mod.href)}
				<a href={mod.href} class="module-item" class:active={page.url.pathname === mod.href}>
					<mod.icon size={15} />
					<div class="module-text">
						<span class="module-label">{mod.label}</span>
						<span class="module-desc">{mod.desc}</span>
					</div>
				</a>
			{/each}
		</div>
	</aside>
</div>

<style lang="scss">
	.workbench {
		display: flex;
		height: 100vh;
		overflow: hidden;
	}

	.analysis-main {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
	}

	.analysis-sidebar {
		width: 280px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		border-left: 1px solid var(--color-border);
		background: var(--color-surface);
		overflow-y: auto;
	}

	.analysis-sidebar-header {
		padding: 14px 14px 10px;
	}

	.analysis-sidebar-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.module-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 8px 12px;
	}

	.module-item {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 8px;
		border-radius: 8px;
		text-decoration: none;
		color: var(--color-text-muted);

		:global(svg) {
			margin-top: 2px;
			flex-shrink: 0;
		}

		&:hover { background: var(--color-background); color: var(--color-text); }

		&.active {
			background: color-mix(in srgb, var(--color-primary) 12%, transparent);
			color: var(--color-primary);

			.module-desc { color: var(--color-primary); opacity: 0.8; }
		}
	}

	.module-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.module-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: inherit;
	}

	.module-desc {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
		line-height: 1.4;
	}
</style>
