<script lang="ts">
	import type { PageData } from './$types';
	import Database from '$lib/components/icon/Database.svelte';
	import Plus from '$lib/components/icon/Plus.svelte';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

</script>


<div class="page">
	<div class="page-header">
		<h1 class="page-title">データソース</h1>
		<a href="/database/new" class="btn-primary">
			<Plus size={14} />
			新規作成
		</a>
	</div>

	<div class="table-wrap">
		<table class="data-table">
			<thead>
				<tr>
					<th>物理名</th>
					<th>テーブル名</th>
					<th>説明</th>
				</tr>
			</thead>
			<tbody>
				{#each data.sources as source (source.id)}
					<tr onclick={()=>goto(`/database/${source.id}`)}>
						<td>{source.tableName}</td>
						<td>{source.name}</td>
						<td>{source.description}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	
</div>

<style lang="scss">
	.page {
		padding: 24px 32px;
	}
	.page-header {
		display: flex;
		align-items: center;
		gap: 16px;
		justify-content: space-between;
		margin-bottom: 16px;
	}
	.page-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background: var(--color-primary);
		color: #fff;
		border: none;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		transition: opacity 0.15s;
		flex-shrink: 0;

		&:hover { opacity: 0.85; }
	}

	.table-wrap { overflow-x: auto; }

	.data-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
		font-family: ui-monospace, monospace;

		th, td { padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--color-border); white-space: nowrap; }
		th { font-weight: 500; color: var(--color-text-muted); background: var(--color-surface); }

		& tbody tr:hover {
			background: var(--color-surface);
			cursor: pointer;
		}
	}
</style>

