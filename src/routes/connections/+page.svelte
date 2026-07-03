<script lang="ts">
	import { untrack } from 'svelte';
	import Textbox from '$lib/components/ui/Textbox.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Connection = {
		id: string;
		name: string;
		description: string | null;
		provider: string;
		config: { bindingName?: string };
		createdAt: Date;
	};

	let items = $state<Connection[]>(untrack(() => data.items));
	$effect(() => {
		items = data.items;
	});

	const bindingOptions = $derived(data.availableBindings.map((b) => ({ value: b, label: b })));

	let showForm = $state(false);
	let saving = $state(false);
	let error = $state('');

	let form = $state({ name: '', description: '', bindingName: '' });

	function openAdd() {
		form = { name: '', description: '', bindingName: data.availableBindings[0] ?? '' };
		error = '';
		showForm = true;
	}

	function cancel() {
		showForm = false;
	}

	async function save() {
		saving = true;
		error = '';
		try {
			const res = await fetch('/api/db-connections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: form.name,
					description: form.description || undefined,
					provider: 'hyperdrive',
					config: { bindingName: form.bindingName }
				})
			});
			const body = (await res.json()) as Connection & { error?: string };
			if (!res.ok) {
				error = body.error ?? '保存に失敗しました';
				return;
			}
			items = [...items, body].sort((a, b) => a.name.localeCompare(b.name));
			showForm = false;
		} finally {
			saving = false;
		}
	}

	async function remove(id: string) {
		if (!confirm('この接続設定を削除します。取り込み済みのデータソースは残ります。よろしいですか？')) return;
		await fetch(`/api/db-connections/${id}`, { method: 'DELETE' });
		items = items.filter((i) => i.id !== id);
	}
</script>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">接続管理</h1>
		<button class="add-btn" onclick={openAdd} disabled={data.availableBindings.length === 0}>+ 接続を追加</button>
	</div>

	<p class="lead">
		外部DB（Postgres/Supabase/AWS RDS等）のテーブルをデータソースとして取り込みます。API連携（通知先の設定）とは別の機能です。
	</p>

	{#if data.availableBindings.length === 0}
		<p class="empty">
			利用可能なHyperdriveバインディングがありません。wrangler.tomlに<code>HYPERDRIVE_</code>で始まる名前のバインディングを登録し、デプロイしてください。
		</p>
	{:else if items.length === 0 && !showForm}
		<p class="empty">接続がまだありません。「+ 接続を追加」から作成してください。</p>
	{/if}

	<ul class="list">
		{#each items as item (item.id)}
			<li class="item">
				<div class="item-info">
					<span class="item-name">{item.name}</span>
					<span class="item-url">{item.config.bindingName}</span>
					{#if item.description}
						<span class="item-desc">{item.description}</span>
					{/if}
				</div>
				<div class="item-meta">
					<span class="badge">Hyperdrive</span>
					<a href="/connections/{item.id}" class="link-btn">テーブルを取り込む</a>
					<button class="link-btn danger" onclick={() => remove(item.id)}>削除</button>
				</div>
			</li>
		{/each}
	</ul>

	{#if showForm}
		<div class="form-card">
			<h2>接続を追加</h2>
			{#if error}<p class="form-error">{error}</p>{/if}
			<div class="fields">
				<Textbox label="名前" bind:value={form.name} placeholder="例: 顧客DB（本番RDS）" required />
				<Textbox label="説明" bind:value={form.description} />
				<Select label="Hyperdriveバインディング" bind:value={form.bindingName} options={bindingOptions} />
			</div>
			<div class="form-actions">
				<button class="cancel-btn" onclick={cancel}>キャンセル</button>
				<button class="save-btn" onclick={save} disabled={saving || !form.name || !form.bindingName}>保存</button>
			</div>
		</div>
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

	.add-btn {
		flex-shrink: 0;
		padding: 8px 16px;
		background: var(--color-primary);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		cursor: pointer;

		&:disabled { opacity: 0.4; cursor: not-allowed; }
		&:not(:disabled):hover { opacity: 0.85; }
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		margin-top: 40px;
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
		margin-bottom: 24px;
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

	.item-desc {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
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
	.link-btn.danger:hover { color: var(--color-danger); }

	.form-card {
		border: 1px solid var(--color-border);
		border-radius: 10px;
		padding: 24px;
		background: var(--color-surface);
	}

	h2 {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 20px;
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--color-error);
		margin: 0 0 12px;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-bottom: 24px;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}

	.cancel-btn {
		padding: 8px 16px;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-size: 0.875rem;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.cancel-btn:hover { border-color: var(--color-text-muted); }

	.save-btn {
		padding: 8px 20px;
		background: var(--color-primary);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		cursor: pointer;
	}

	.save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.save-btn:not(:disabled):hover { opacity: 0.85; }
</style>
