<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import Plus from '$lib/components/icon/Plus.svelte';
	import Database from '$lib/components/icon/Database.svelte';
	import X from '$lib/components/icon/X.svelte';

	let { data }: { data: PageData } = $props();

	type ColumnDef = { key: string; label: string; type: 'text' | 'number' | 'date' | 'boolean' };

	let showCreate = $state(false);
	let creating = $state(false);
	let newName = $state('');
	let newDesc = $state('');
	let newCols = $state<ColumnDef[]>([{ key: 'column1', label: 'カラム1', type: 'text' }]);

	function addCol() {
		newCols = [...newCols, { key: `column${newCols.length + 1}`, label: `カラム${newCols.length + 1}`, type: 'text' }];
	}

	function removeCol(i: number) {
		newCols = newCols.filter((_, idx) => idx !== i);
	}

	async function createDataSource() {
		if (!newName.trim() || newCols.length === 0) return;
		creating = true;
		try {
			const res = await fetch('/api/data-sources', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined, columns: newCols })
			});
			if (!res.ok) throw new Error('作成に失敗しました');
			showCreate = false;
			newName = '';
			newDesc = '';
			newCols = [{ key: 'column1', label: 'カラム1', type: 'text' }];
			await invalidateAll();
		} catch (e) {
			alert(e instanceof Error ? e.message : '作成に失敗しました');
		} finally {
			creating = false;
		}
	}

	async function deleteSource(id: string, name: string) {
		if (!confirm(`「${name}」を削除しますか？データもすべて削除されます。`)) return;
		await fetch(`/api/data-sources/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">データソース</h1>
		<button class="btn-primary" onclick={() => (showCreate = !showCreate)}>
			<Plus size={14} />
			新規作成
		</button>
	</div>

	{#if showCreate}
		<div class="create-form">
			<h2 class="form-title">新しいデータソース</h2>
			<div class="field">
				<label>名前 <span class="required">*</span></label>
				<input type="text" bind:value={newName} placeholder="例: 月次売上データ" />
			</div>
			<div class="field">
				<label>説明</label>
				<input type="text" bind:value={newDesc} placeholder="このデータソースの説明（任意）" />
			</div>
			<div class="cols-section">
				<div class="cols-header">
					<label>カラム定義</label>
					<button class="btn-link" onclick={addCol}>+ 追加</button>
				</div>
				{#each newCols as col, i}
					<div class="col-row">
						<input type="text" bind:value={col.key} placeholder="キー (英数字)" class="col-key" />
						<input type="text" bind:value={col.label} placeholder="ラベル（日本語可）" class="col-label" />
						<select bind:value={col.type} class="col-type">
							<option value="text">テキスト</option>
							<option value="number">数値</option>
							<option value="date">日付</option>
							<option value="boolean">真偽値</option>
						</select>
						<button class="btn-icon-sm" onclick={() => removeCol(i)} disabled={newCols.length <= 1}>
							<X size={12} />
						</button>
					</div>
				{/each}
			</div>
			<div class="form-actions">
				<button class="btn-primary" onclick={createDataSource} disabled={creating || !newName.trim()}>
					{creating ? '作成中...' : '作成'}
				</button>
				<button class="btn-secondary" onclick={() => (showCreate = false)}>キャンセル</button>
			</div>
		</div>
	{/if}

	{#if data.sources.length === 0 && !showCreate}
		<div class="empty">
			<Database size={32} />
			<p>データソースがありません</p>
			<p class="empty-sub">「新規作成」からデータを登録するか、CSVをインポートしてください。</p>
		</div>
	{:else}
		<div class="sources-grid">
			{#each data.sources as source}
				<div class="source-card">
					<div class="source-info">
						<div class="source-name">{source.name}</div>
						{#if source.description}
							<div class="source-desc">{source.description}</div>
						{/if}
						<div class="source-meta">
							{JSON.parse(source.schemaJson).length}カラム · {source.rowCount.toLocaleString()}件
						</div>
					</div>
					<div class="source-actions">
						<a href="/data/{source.id}" class="btn-secondary-sm">詳細</a>
						<button class="btn-danger-sm" onclick={() => deleteSource(source.id, source.name)}>削除</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.page {
		padding: 32px;
		max-width: 900px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24px;
	}

	.page-title {
		font-size: 1.375rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.btn-primary {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background: var(--color-primary);
		color: #fff;
		border: none;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.15s;

		&:hover { opacity: 0.85; }
		&:disabled { opacity: 0.5; cursor: not-allowed; }
	}

	.btn-secondary {
		padding: 8px 16px;
		background: transparent;
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		font-size: 0.875rem;
		cursor: pointer;
		transition: background 0.15s;

		&:hover { background: var(--color-background); }
	}

	.btn-secondary-sm {
		padding: 5px 12px;
		background: transparent;
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-size: 0.8125rem;
		text-decoration: none;
		transition: background 0.15s;

		&:hover { background: var(--color-background); }
	}

	.btn-danger-sm {
		padding: 5px 12px;
		background: transparent;
		color: var(--color-danger, #dc2626);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-size: 0.8125rem;
		cursor: pointer;
		transition: background 0.15s;

		&:hover { background: var(--color-background); }
	}

	.btn-link {
		background: none;
		border: none;
		color: var(--color-primary);
		font-size: 0.8125rem;
		cursor: pointer;
		padding: 0;
	}

	.btn-icon-sm {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		color: var(--color-text-muted);
		cursor: pointer;
		flex-shrink: 0;

		&:disabled { opacity: 0.3; cursor: not-allowed; }
		&:not(:disabled):hover {
			color: var(--color-danger, #dc2626);
			border-color: var(--color-danger, #dc2626);
		}
	}

	.create-form {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		padding: 24px;
		margin-bottom: 24px;
	}

	.form-title {
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 16px;
		color: var(--color-text);
	}

	.field {
		margin-bottom: 12px;

		label {
			display: block;
			font-size: 0.8125rem;
			color: var(--color-text-muted);
			margin-bottom: 4px;
		}

		input {
			width: 100%;
			padding: 8px 10px;
			border: 1px solid var(--color-border);
			border-radius: 6px;
			background: var(--color-background);
			color: var(--color-text);
			font-size: 0.875rem;
			font-family: inherit;
			outline: none;
			box-sizing: border-box;

			&:focus { border-color: var(--color-primary); }
		}
	}

	.required { color: var(--color-danger, #dc2626); }

	.cols-section { margin-bottom: 16px; }

	.cols-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;

		label { font-size: 0.8125rem; color: var(--color-text-muted); }
	}

	.col-row {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-bottom: 8px;

		input, select {
			padding: 6px 8px;
			border: 1px solid var(--color-border);
			border-radius: 6px;
			background: var(--color-background);
			color: var(--color-text);
			font-size: 0.8125rem;
			font-family: inherit;
			outline: none;

			&:focus { border-color: var(--color-primary); }
		}

		.col-key { flex: 1; }
		.col-label { flex: 1.5; }
		.col-type { width: 100px; }
	}

	.form-actions {
		display: flex;
		gap: 8px;
		margin-top: 16px;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 80px 24px;
		color: var(--color-text-muted);

		p { margin: 0; }
		.empty-sub { font-size: 0.875rem; }
	}

	.sources-grid {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.source-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 20px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		transition: border-color 0.15s;

		&:hover { border-color: var(--color-primary); }
	}

	.source-info { min-width: 0; }
	.source-name { font-size: 0.9375rem; font-weight: 500; color: var(--color-text); }
	.source-desc { font-size: 0.8125rem; color: var(--color-text-muted); margin-top: 2px; }
	.source-meta { font-size: 0.75rem; color: var(--color-text-muted); margin-top: 4px; }
	.source-actions { display: flex; gap: 8px; flex-shrink: 0; }
</style>
