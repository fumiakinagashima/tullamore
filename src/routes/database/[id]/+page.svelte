<script lang="ts">
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import Download from '$lib/components/icon/Download.svelte';
	import DataGrid from '$lib/components/ui/DataGrid.svelte';
	import FileUpload from '$lib/components/ui/FileUpload.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';

	let { data }: { data: PageData } = $props();
	let { source, sync, connectionName } = $derived(data);

	let resyncing = $state(false);
	let resyncResult = $state<string | null>(null);

	async function resync() {
		resyncing = true;
		resyncResult = null;
		try {
			const res = await fetch(`/api/data-sources/${source.id}/resync`, { method: 'POST' });
			const body = (await res.json()) as { inserted?: number; error?: string };
			if (!res.ok) throw new Error(body.error ?? '再同期に失敗しました');
			resyncResult = `${body.inserted}件を再取り込みしました`;
			await invalidateAll();
		} catch (e) {
			resyncResult = `エラー: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			resyncing = false;
		}
	}

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

	// CSVテンプレートダウンロード（1行目: カラムキー、2行目: サンプル値。そのまま上書きして使う想定）
	function csvEscape(v: string): string {
		return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
	}

	function sampleValue(col: Col): string {
		if (col.type === 'number') return '0';
		if (col.type === 'boolean') return 'true';
		if (col.type === 'date') return '2024-01-01';
		return col.label;
	}

	function downloadTemplate() {
		const header = columns.map((c) => csvEscape(c.key)).join(',');
		const sample = columns.map((c) => csvEscape(sampleValue(c))).join(',');
		const csv = `${header}\n${sample}\n`;
		const BOM = '﻿';
		const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${source.tableName}_template.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// CSV import
	let importing = $state(false);
	let importResult = $state<string | null>(null);
	let replaceExisting = $state(false);

	async function handleImport(files: File[]) {
		const file = files[0];
		if (!file) return;
		if (replaceExisting && !confirm('既存データを全て削除してから登録します。よろしいですか？')) return;
		importing = true;
		importResult = null;
		const fd = new FormData();
		fd.append('file', file);
		if (replaceExisting) fd.append('replace', 'true');
		try {
			const res = await fetch(`/api/data-sources/${source.id}/import`, { method: 'POST', body: fd });
			const json = (await res.json()) as { inserted?: number; error?: string };
			if (!res.ok) throw new Error(json.error ?? 'インポートに失敗しました');
			importResult = replaceExisting
				? `既存データを削除し、${json.inserted}件を登録しました`
				: `${json.inserted}件をインポートしました`;
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
		const res = await fetch(`/api/data-sources/${source.id}/rows?limit=30`);
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
		<div class="header-actions">
			<a href="/database/{source.id}/build" class="btn-secondary">編集</a>
			<button class="btn-danger" onclick={deleteSource} disabled={deleting}>
				{deleting ? '削除中...' : '削除'}
			</button>
		</div>
	</div>

	<div class="meta-row">
		<span class="meta-chip">{columns.length}カラム</span>
		<span class="meta-chip">{source.rowCount.toLocaleString()}件</span>
		<span class="meta-chip mono">テーブル名: {source.tableName}</span>
	</div>

	{#if sync}
		<div class="sync-banner">
			<span class="sync-info">
				取り込み元: {connectionName} / {sync.externalSchema}.{sync.externalTable}
				{#if sync.lastSyncedAt}（最終同期: {new Date(sync.lastSyncedAt).toLocaleString('ja-JP')}）{/if}
			</span>
			<button class="btn-secondary" onclick={resync} disabled={resyncing}>
				{resyncing ? '同期中...' : '今すぐ再同期'}
			</button>
		</div>
		{#if resyncResult}
			<p class="import-result" class:error={resyncResult.startsWith('エラー')}>{resyncResult}</p>
		{/if}
	{/if}

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
		<p class="section-note">テンプレートをダウンロードし、2行目以降にデータを入力（サンプル行は上書き）してからアップロードしてください</p>
		<button class="file-label template-btn" onclick={downloadTemplate}>
			<Download size={14} />
			テンプレートをダウンロード
		</button>
		<div class="replace-row">
			<Toggle bind:checked={replaceExisting} disabled={importing} label="既存データを全て削除してから登録する" />
		</div>
		<FileUpload accept=".csv,text/csv" disabled={importing} onchange={handleImport} />
		{#if importing}<p class="import-result">インポート中...</p>{/if}
		{#if importResult}
			<p class="import-result" class:error={importResult.startsWith('エラー')}>{importResult}</p>
		{/if}
	</section>

	<section class="section">
		<h2 class="section-title">データ（先頭30件）</h2>
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

	.header-actions {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}

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

	.btn-secondary {
		flex-shrink: 0;
		padding: 6px 14px;
		background: transparent;
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-size: 0.8125rem;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		cursor: pointer;
		transition: background 0.15s;

		&:hover { background: var(--color-surface); }
	}

	.meta-row { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }

	.sync-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		margin-bottom: 24px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		font-size: 0.8125rem;
		color: var(--color-text);
	}

	.sync-info { min-width: 0; }

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
		font-family: inherit;
		color: var(--color-text);
		cursor: pointer;
		transition: background 0.15s;

		&:hover { background: var(--color-background); }
	}

	.template-btn {
		margin-bottom: 10px;
	}

	.replace-row {
		margin-bottom: 10px;
		font-size: 0.8125rem;
	}

	.import-result {
		font-size: 0.875rem;
		margin-top: 8px;
		color: var(--color-success);

		&.error { color: var(--color-error); }
	}

	.empty-text { font-size: 0.875rem; color: var(--color-text-muted); }
</style>
