<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import Plus from '$lib/components/icon/Plus.svelte';
	import Database from '$lib/components/icon/Database.svelte';
	import Table from '$lib/components/icon/Table.svelte';
	import Search from '$lib/components/icon/Search.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<div class="workbench">
	<div class="db-main">
		{@render children()}
	</div>
	<aside class="db-sidebar">
		<div class="db-sidebar-header">
			<span class="db-sidebar-title">データベース</span>
			<a href="/database/new" class="icon-btn" aria-label="新しいテーブル">
				<Plus size={14} />
			</a>
		</div>
		<a href="/database/" class="sql-link" class:active={page.url.pathname === '/'}>
			<Database size={13} />
			データソース
		</a>
		<a href="/database/sql" class="sql-link" class:active={page.url.pathname === '/database/'}>
			<Search size={13} />
			SQLクエリ
		</a>
		<div class="table-list">
			{#each data.sources as source (source.id)}
				<a
					href="/database/{source.id}"
					class="table-item"
					class:active={page.url.pathname === `/database/${source.id}`}
				>
					<Table size={13} />
					<span class="table-name">{source.name}</span>
				</a>
			{/each}
			{#if data.sources.length === 0}
				<p class="table-list-empty">テーブルがありません</p>
			{/if}
		</div>
	</aside>
</div>

<style lang="scss">
	.workbench {
		display: flex;
		height: 100vh;
		overflow: hidden;
	}

	.db-sidebar {
		width: 280px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--color-border);
		background: var(--color-surface);
		overflow-y: auto;
	}

	.db-sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 14px 10px;
	}

	.db-sidebar-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 5px;
		color: var(--color-text-muted);
		text-decoration: none;
		transition: background 0.15s, color 0.15s;

		&:hover { background: var(--color-background); color: var(--color-text); }
	}

	.sql-link {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 14px 10px;
		padding-bottom: 12px;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		text-decoration: none;
		border-bottom: 1px solid var(--color-border);

		&:hover { color: var(--color-text); }
		&.active { color: var(--color-primary); font-weight: 500; }
	}

	.table-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 0 8px 12px;
	}

	.table-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 6px;
		font-size: 0.8125rem;
		font-family: ui-monospace, monospace;
		color: var(--color-text-muted);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;

		.table-name {
			overflow: hidden;
			text-overflow: ellipsis;
		}

		&:hover { background: var(--color-background); color: var(--color-text); }
		&.active {
			background: color-mix(in srgb, var(--color-primary) 12%, transparent);
			color: var(--color-primary);
			font-weight: 500;
		}
	}

	.table-list-empty {
		padding: 8px 14px;
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.db-main {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
	}
</style>
