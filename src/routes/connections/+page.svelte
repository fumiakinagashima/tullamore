<script lang="ts">
	import { untrack } from 'svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Item = { bindingName: string; connectionId: string | null; name: string; enabled: boolean };

	let items = $state<Item[]>(untrack(() => data.items));
	$effect(() => {
		items = data.items;
	});

	let togglingBinding = $state<string | null>(null);
	let error = $state('');

	async function toggle(item: Item, enabled: boolean) {
		error = '';
		togglingBinding = item.bindingName;
		try {
			if (enabled) {
				const res = await fetch('/api/db-connections', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: item.bindingName,
						provider: 'hyperdrive',
						config: { bindingName: item.bindingName }
					})
				});
				const body = (await res.json()) as { id?: string; error?: string };
				if (!res.ok) {
					error = body.error ?? '有効化に失敗しました';
					return;
				}
				items = items.map((i) => (i.bindingName === item.bindingName ? { ...i, connectionId: body.id!, enabled: true } : i));
			} else {
				if (!item.connectionId) return;
				const res = await fetch(`/api/db-connections/${item.connectionId}`, { method: 'DELETE' });
				if (!res.ok) {
					error = '無効化に失敗しました';
					return;
				}
				items = items.map((i) => (i.bindingName === item.bindingName ? { ...i, connectionId: null, enabled: false } : i));
			}
		} finally {
			togglingBinding = null;
		}
	}
</script>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">接続管理</h1>
	</div>

	<p class="lead">
		wrangler.tomlに登録済みのHyperdriveバインディング（外部DB接続）を一覧表示します。有効にすると、そのDBのテーブルをデータソースとして取り込めるようになります。無効にしても、既に取り込み済みのデータソースは残ります。
	</p>

	{#if error}<p class="form-error">{error}</p>{/if}

	{#if items.length === 0}
		<p class="empty">
			利用可能なHyperdriveバインディングがありません。wrangler.tomlに<code>HYPERDRIVE_</code>で始まる名前のバインディングを登録し、デプロイしてください。
		</p>
	{:else}
		<ul class="list">
			{#each items as item (item.bindingName)}
				<li class="item">
					<div class="item-info">
						<span class="item-name">{item.name}</span>
						<span class="item-url">{item.bindingName}</span>
					</div>
					<div class="item-meta">
						<span class="badge">Hyperdrive</span>
						{#if item.enabled && item.connectionId}
							<a href="/connections/{item.connectionId}" class="link-btn">テーブルを取り込む</a>
						{/if}
						<Toggle
							checked={item.enabled}
							disabled={togglingBinding === item.bindingName}
							onchange={(checked) => toggle(item, checked)}
						/>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	.page {
		padding: 28px 32px;
		max-width: 780px;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 12px;
	}

	.page-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.lead {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0 0 20px;
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--color-error);
		margin: 0 0 12px;
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		margin: 40px 0;
		text-align: center;

		code {
			background: var(--color-border);
			padding: 1px 5px;
			border-radius: 4px;
		}
	}

	.list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 14px 16px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-surface);
	}

	.item-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.item-name {
		font-size: 0.9375rem;
		font-weight: 500;
	}

	.item-url {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		font-family: ui-monospace, monospace;
	}

	.item-meta {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
	}

	.badge {
		font-size: 0.75rem;
		padding: 2px 8px;
		border-radius: 4px;
		background: var(--color-border);
		color: var(--color-text-muted);
	}

	.link-btn {
		background: none;
		border: none;
		font-size: 0.875rem;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0;
		text-decoration: none;
	}

	.link-btn:hover { color: var(--color-text); }
</style>
