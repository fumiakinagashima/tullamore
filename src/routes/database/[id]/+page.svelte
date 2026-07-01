<script lang="ts">
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import Upload from '$lib/components/icon/Upload.svelte';
	import DataGrid from '$lib/components/ui/DataGrid.svelte';

	let { data }: { data: PageData } = $props();
	let { source } = $derived(data);

	type Col = { key: string; label: string; type: 'text' | 'number' | 'date' | 'boolean' };
	let columns: Col[] = $derived(JSON.parse(source.schemaJson));

	const gridColumns = $derived(
		columns.map((col) => ({
			key: col.key,
			label: col.label,
			type: (col.type === 'number' ? 'number' : 'text') as 'number' | 'text',
			readonly: true
		}))
	);

	// CSV import
	let importing = $state(false);
	let importResult = $state<string | null>(null);

	async function handleImport(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		importing = true;
		importResult = null;
		const fd = new FormData();
		fd.append('file', file);
		try {
			const res = await fetch(`/api/data-sources/${source.id}/import`, { method: 'POST', body: fd });
			const json = (await res.json()) as { inserted?: number; error?: string };
			if (!res.ok) throw new Error(json.error ?? 'インポートに失敗しました');
			importResult = `${json.inserted}件をインポートしました`;
			await invalidateAll();
		} catch (err) {
			importResult = `エラー: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			importing = false;
		}
	}

	// Preview
	let previewRows = $state<Record<string, string | number | null>[]>([]);
	let previewLoaded = $state(false);

	async function loadPreview() {
		previewLoaded = false;
		const res = await fetch(`/api/data-sources/${source.id}/rows?limit=100`);
		const json = (await res.json()) as { rows: Record<string, string | number | null>[] };
		previewRows = json.rows;
		previewLoaded = true;
	}

	$effect(() => {
		void source.id;
		loadPreview();
	});

	// 削除
	let deleting = $state(false);

	async function deleteSource() {
		if (!confirm(`「${source.name}」を削除しますか？データもすべて削除されます。`)) return;
		deleting = true;
		try {
			await fetch(`/api/data-sources/${source.id}`, { method: 'DELETE' });
			await invalidateAll();
			await goto('/database');
		} finally {
			deleting = false;
		}
	}
</script>

<div class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">{source.name}</h1>
			{#if source.description}<p class="source-desc">{source.description}</p>{/if}
		</div>
		<button class="btn-danger" onclick={deleteSource} disabled={deleting}>
			{deleting ? '削除中...' : '削除'}
		</button>
	</div>

	<div class="meta-row">
		<span class="meta-chip">{columns.length}カラム</span>
		<span class="meta-chip">{source.rowCount.toLocaleString()}件</span>
		<span class="meta-chip mono">テーブル名: {source.tableName}</span>
	</div>

	<section class="section">
		<h2 class="section-title">スキーマ</h2>
		<table class="schema-table">
			<thead><tr><th>フィールド名（物理名）</th><th>ラベル</th><th>型</th></tr></thead>
			<tbody>
				{#each columns as col (col.key)}
					<tr><td class="mono">{col.key}</td><td>{col.label}</td><td class="type-badge">{col.type}</td></tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section class="section">
		<h2 class="section-title">CSVインポート</h2>
		<p class="section-note">1行目はヘッダー行（カラムキーと一致する必要があります）</p>
		<label class="file-label" class:importing>
			<Upload size={14} />
			{importing ? 'インポート中...' : 'CSVファイルを選択'}
			<input type="file" accept=".csv,text/csv" onchange={handleImport} disabled={importing} style="display:none" />
		</label>
		{#if importResult}
			<p class="import-result" class:error={importResult.startsWith('エラー')}>{importResult}</p>
		{/if}
	</section>

	<section class="section">
		<h2 class="section-title">データ（先頭100件）</h2>
		{#if !previewLoaded}
			<p class="empty-text">読み込み中...</p>
		{:else if previewRows.length === 0}
			<p class="empty-text">データがありません</p>
		{:else}
			<DataGrid columns={gridColumns} rows={previewRows} addable={false} deletable={false} />
		{/if}
	</section>
</div>

<style lang="scss">
	.page {
		padding: 28px 32px;
		max-width: 1040px;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 16px;
	}

	.page-title { font-size: 1.125rem; font-weight: 600; color: var(--color-text); margin: 0 0 4px; }
	.source-desc { font-size: 0.875rem; color: var(--color-text-muted); margin: 0; }

	.btn-danger {
		flex-shrink: 0;
		padding: 6px 14px;
		background: transparent;
		color: var(--color-error);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-size: 0.8125rem;
		cursor: pointer;
		transition: background 0.15s;

		&:hover { background: var(--color-error-bg); }
		&:disabled { opacity: 0.5; cursor: not-allowed; }
	}

	.meta-row { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }

	.meta-chip {
		display: inline-flex;
		align-items: center;
		padding: 3px 10px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		font-size: 0.75rem;
		color: var(--color-text-muted);

		&.mono { font-family: ui-monospace, monospace; }
	}

	.mono { font-family: ui-monospace, monospace; }

	.section { margin-bottom: 32px; }

	.section-title { font-size: 0.9375rem; font-weight: 600; color: var(--color-text); margin: 0 0 12px; }

	.section-note {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0 0 8px;
	}

	.schema-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;

		th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--color-border); }
		th { font-weight: 500; color: var(--color-text-muted); background: var(--color-surface); }
	}

	.type-badge { color: var(--color-text-muted); font-size: 0.8125rem; }

	.file-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		font-size: 0.875rem;
		color: var(--color-text);
		cursor: pointer;
		transition: background 0.15s;

		&:hover { background: var(--color-background); }
		&.importing { opacity: 0.6; cursor: not-allowed; }
	}

	.import-result {
		font-size: 0.875rem;
		margin-top: 8px;
		color: var(--color-success);

		&.error { color: var(--color-error); }
	}

	.empty-text { font-size: 0.875rem; color: var(--color-text-muted); }
</style>
