<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import Upload from '$lib/components/icon/Upload.svelte';
	import Database from '$lib/components/icon/Database.svelte';

	let { data }: { data: PageData } = $props();
	let { source } = $derived(data);

	type Col = { key: string; label: string; type: string };
	let columns: Col[] = $derived(JSON.parse(source.schemaJson));

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
			const json = await res.json() as { inserted?: number; error?: string };
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
	let previewRows = $state<Record<string, unknown>[]>([]);
	let previewLoaded = $state(false);

	async function loadPreview() {
		previewLoaded = false;
		const res = await fetch(`/api/data-sources/${source.id}/rows?limit=20`);
		const json = await res.json() as { rows: Record<string, unknown>[] };
		previewRows = json.rows;
		previewLoaded = true;
	}

	$effect(() => {
		void source.id;
		loadPreview();
	});

	// SQL editor
	let sqlInput = $state('');
	let sqlResult = $state<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
	let sqlError = $state<string | null>(null);
	let sqlRunning = $state(false);

	async function runSql() {
		if (!sqlInput.trim()) return;
		sqlRunning = true;
		sqlError = null;
		sqlResult = null;
		try {
			const res = await fetch('/api/sql/execute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sql: sqlInput })
			});
			const json = await res.json() as { columns?: string[]; rows?: Record<string, unknown>[]; message?: string };
			if (!res.ok) { sqlError = json.message ?? '実行に失敗しました'; return; }
			sqlResult = { columns: json.columns ?? [], rows: json.rows ?? [] };
		} finally {
			sqlRunning = false;
		}
	}
</script>

<div class="page">
	<div class="page-header">
		<a href="/data" class="back-link">← データソース</a>
		<h1 class="page-title">{source.name}</h1>
		{#if source.description}<p class="source-desc">{source.description}</p>{/if}
	</div>

	<div class="meta-row">
		<span class="meta-chip">{columns.length}カラム</span>
		<span class="meta-chip">{source.rowCount.toLocaleString()}件</span>
		<span class="meta-chip mono">テーブル名: {source.tableName}</span>
	</div>

	<section class="section">
		<h2 class="section-title">スキーマ</h2>
		<table class="schema-table">
			<thead><tr><th>キー</th><th>ラベル</th><th>型</th></tr></thead>
			<tbody>
				{#each columns as col}
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
		<h2 class="section-title">プレビュー（先頭20件）</h2>
		{#if !previewLoaded}
			<p class="empty-text">読み込み中...</p>
		{:else if previewRows.length === 0}
			<p class="empty-text">データがありません</p>
		{:else}
			<div class="table-wrap">
				<table class="data-table">
					<thead>
						<tr>
							{#each columns as col}<th>{col.label}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each previewRows as row}
							<tr>
								{#each columns as col}<td>{row[col.key] ?? ''}</td>{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="section">
		<h2 class="section-title">SQLエディタ</h2>
		<p class="section-note">テーブル名: <code>{source.tableName}</code>（SELECTのみ）</p>
		<textarea
			bind:value={sqlInput}
			class="sql-textarea"
			placeholder={`SELECT * FROM \`${source.tableName}\` LIMIT 100`}
			rows="4"
		></textarea>
		<button class="btn-primary" onclick={runSql} disabled={sqlRunning || !sqlInput.trim()}>
			{sqlRunning ? '実行中...' : '実行'}
		</button>
		{#if sqlError}
			<p class="sql-error">{sqlError}</p>
		{/if}
		{#if sqlResult}
			<div class="table-wrap" style:margin-top="12px">
				<p class="result-count">{sqlResult.rows.length}件</p>
				<table class="data-table">
					<thead><tr>{#each sqlResult.columns as col}<th>{col}</th>{/each}</tr></thead>
					<tbody>
						{#each sqlResult.rows as row}
							<tr>{#each sqlResult.columns as col}<td>{row[col] ?? ''}</td>{/each}</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style lang="scss">
	.page { padding: 32px; max-width: 960px; margin: 0 auto; }

	.page-header { margin-bottom: 16px; }

	.back-link {
		font-size: 0.875rem;
		color: var(--color-primary);
		text-decoration: none;
		display: block;
		margin-bottom: 8px;

		&:hover { text-decoration: underline; }
	}

	.page-title { font-size: 1.375rem; font-weight: 600; color: var(--color-text); margin: 0 0 4px; }
	.source-desc { font-size: 0.875rem; color: var(--color-text-muted); margin: 0; }

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

		code {
			font-family: ui-monospace, monospace;
			background: var(--color-border);
			padding: 1px 5px;
			border-radius: 3px;
		}
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

	.table-wrap { overflow-x: auto; }

	.data-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;

		th, td { padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--color-border); white-space: nowrap; }
		th { font-weight: 500; color: var(--color-text-muted); background: var(--color-surface); }
	}

	.empty-text { font-size: 0.875rem; color: var(--color-text-muted); }

	.sql-textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 10px 12px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-surface);
		color: var(--color-text);
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
		resize: vertical;
		margin-bottom: 8px;

		&:focus { outline: none; border-color: var(--color-primary); }
	}

	.btn-primary {
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

	.sql-error {
		font-size: 0.8125rem;
		color: var(--color-error);
		margin-top: 8px;
		font-family: ui-monospace, monospace;
	}

	.result-count { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0 0 8px; }
</style>
