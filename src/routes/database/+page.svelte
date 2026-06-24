<script lang="ts">
	import type { Component } from 'svelte';
	import type { PageData } from './$types';
	import Building from '$lib/components/icon/Building.svelte';
	import User from '$lib/components/icon/User.svelte';
	import Briefcase from '$lib/components/icon/Briefcase.svelte';
	import Clipboard from '$lib/components/icon/Clipboard.svelte';
	import Table from '$lib/components/icon/Table.svelte';

	let { data }: { data: PageData } = $props();
	const tables = $derived(data.tables);

	const ICON_MAP: Record<string, Component> = { building: Building, user: User, briefcase: Briefcase, clipboard: Clipboard, table: Table };
</script>

<div class="page">
	<header class="page-header">
		<h1>データ管理</h1>
	</header>

	<section>
		<div class="grid">
			{#each tables as table}
				{@const Icon = ICON_MAP[table.icon] ?? ICON_MAP.table}
				<a href="/database/{table.id}" class="card">
					<span class="card-icon"><Icon size={28} /></span>
					<span class="card-label">{table.label}</span>
					<span class="card-count">{table.count} 件</span>
				</a>
			{/each}
		</div>
	</section>
</div>

<style lang="scss">
	.page {
		padding: 32px;
	}

	.page-header {
		margin-bottom: 32px;
	}

	h1 {
		font-size: 1.375rem;
		font-weight: 700;
		margin: 0;
	}

	section {
		margin-bottom: 32px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 12px;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px 16px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		text-decoration: none;
		color: var(--color-text);
		transition: border-color 0.15s, box-shadow 0.15s;
		cursor: pointer;
	}

	.card:hover {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 12%, transparent);
	}

	.card-icon {
		color: var(--color-primary);
		display: flex;
	}

	.card-label {
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.card-count {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}
</style>
