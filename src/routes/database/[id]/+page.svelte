<script lang="ts">
	import type { PageData } from './$types';
	import type { DataQualityReport } from '$lib/server/analysis/data-quality';
	import { goto, invalidateAll } from '$app/navigation';
	import { INGEST_SYNC_POLL_INTERVAL_MS } from '$lib/constants';
	import Download from '$lib/components/icon/Download.svelte';
	import DataGrid from '$lib/components/ui/DataGrid.svelte';
	import FileUpload from '$lib/components/ui/FileUpload.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';

	let { data }: { data: PageData } = $props();
	let { source, sync, connectionName } = $derived(data);

	let resyncing = $state(false);
	let resyncResult = $state<string | null>(null);

	async function resync() {
		resyncing = true;
		resyncResult = null;
		try {
			const res = await fetch(`/api/data-sources/${source.id}/resync`, { method: 'POST' });
			const body = (await res.json()) as { inserted?: number; truncated?: boolean; queued?: boolean; error?: string };
			if (!res.ok) throw new Error(body.error ?? 'Resync failed');
			resyncResult = body.queued
				? `Ingested ${body.inserted} rows so far; the rest is being processed in the background`
				: `Re-ingested ${body.inserted} rows`;
			await invalidateAll();
		} catch (e) {
			resyncResult = `Error: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			resyncing = false;
		}
	}

	// While a large-table continuation ingest via Queue is in progress (lastSyncStatus === 'syncing'),
	// reload at a fixed interval until it completes or fails, to reflect progress (lastSyncRowCount)
	$effect(() => {
		if (sync?.lastSyncStatus !== 'syncing') return;
		const timer = setInterval(() => invalidateAll(), INGEST_SYNC_POLL_INTERVAL_MS);
		return () => clearInterval(timer);
	});

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

	// CSV template download (row 1: column keys, row 2: sample values, meant to be overwritten in place)
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
		if (replaceExisting && !confirm('This will delete all existing data before importing. Continue?')) return;
		importing = true;
		importResult = null;
		const fd = new FormData();
		fd.append('file', file);
		if (replaceExisting) fd.append('replace', 'true');
		try {
			const res = await fetch(`/api/data-sources/${source.id}/import`, { method: 'POST', body: fd });
			const json = (await res.json()) as { inserted?: number; error?: string };
			if (!res.ok) throw new Error(json.error ?? 'Import failed');
			importResult = replaceExisting
				? `Deleted existing data and registered ${json.inserted} rows`
				: `Imported ${json.inserted} rows`;
			await invalidateAll();
		} catch (err) {
			importResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
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

	// Data quality check
	let qualityReport = $state<DataQualityReport | null>(null);
	let qualityLoading = $state(false);

	async function loadQuality() {
		qualityLoading = true;
		try {
			const res = await fetch(`/api/data-sources/${source.id}/quality`);
			const json = (await res.json()) as { report?: DataQualityReport };
			qualityReport = json.report ?? null;
		} finally {
			qualityLoading = false;
		}
	}

	$effect(() => {
		void source.id;
		loadPreview();
		loadQuality();
	});

	// Delete
	let deleting = $state(false);

	async function deleteSource() {
		if (!confirm(`Delete "${source.name}"? All of its data will also be deleted.`)) return;
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
			<a href="/database/{source.id}/build" class="btn-secondary">Edit</a>
			<button class="btn-danger" onclick={deleteSource} disabled={deleting}>
				{deleting ? 'Deleting...' : 'Delete'}
			</button>
		</div>
	</div>

	<div class="meta-row">
		<span class="meta-chip">{columns.length} columns</span>
		<span class="meta-chip">{source.rowCount.toLocaleString()} rows</span>
		<span class="meta-chip mono">Table name: {source.tableName}</span>
	</div>

	{#if sync}
		<div class="sync-banner">
			<span class="sync-info">
				Source: {connectionName} / {sync.externalSchema}.{sync.externalTable}
				{#if sync.lastSyncStatus === 'syncing'}
					<span class="sync-status-badge syncing">Ingesting in background ({sync.lastSyncRowCount.toLocaleString()} rows so far)</span>
				{:else if sync.lastSyncStatus === 'failed'}
					<span class="sync-status-badge failed">Ingestion failed{sync.lastSyncError ? `: ${sync.lastSyncError}` : ''}</span>
				{:else if sync.lastSyncedAt}
					(Last synced: {new Date(sync.lastSyncedAt).toLocaleString('en-US')})
				{/if}
			</span>
			<button class="btn-secondary" onclick={resync} disabled={resyncing || sync.lastSyncStatus === 'syncing'}>
				{resyncing ? 'Syncing...' : 'Sync now'}
			</button>
		</div>
		{#if resyncResult}
			<p class="import-result" class:error={resyncResult.startsWith('Error')}>{resyncResult}</p>
		{/if}
	{/if}

	<section class="section">
		<h2 class="section-title">Schema</h2>
		<table class="schema-table">
			<thead><tr><th>Field name (physical)</th><th>Label</th><th>Type</th></tr></thead>
			<tbody>
				{#each columns as col (col.key)}
					<tr><td class="mono">{col.key}</td><td>{col.label}</td><td class="type-badge">{col.type}</td></tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section class="section">
		<h2 class="section-title">Data quality check</h2>
		{#if qualityLoading}
			<p class="empty-text">Checking...</p>
		{:else if qualityReport}
			{#if qualityReport.lowRowCountWarning}
				<p class="import-result error">
					The row count ({qualityReport.rowCount.toLocaleString()}) is low, which may affect the reliability of analysis (rule of thumb: 30+ rows)
				</p>
			{/if}
			{#if qualityReport.columns.length === 0}
				<p class="empty-text">No numeric columns to check for quality</p>
			{:else}
				<div class="quality-table-wrap">
					<table class="quality-table">
						<thead>
							<tr>
								<th>Column</th>
								<th>Count</th>
								<th>Missing</th>
								<th>Outlier candidates</th>
								<th>Result</th>
							</tr>
						</thead>
						<tbody>
							{#each qualityReport.columns as col (col.key)}
								<tr>
									<td>{col.label}</td>
									<td>{col.n.toLocaleString()}</td>
									<td>{col.missingCount.toLocaleString()}</td>
									<td>{col.outlierCount.toLocaleString()}</td>
									<td>
										<span class="quality-badge level-{col.validity.overallLevel}">
											{col.validity.overallLevel === 'good' ? 'Valid' : col.validity.overallLevel === 'caution' ? 'Caution' : 'Review needed'}
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#each qualityReport.columns.filter((c) => c.validity.overallLevel !== 'good') as col (col.key)}
					<div class="quality-detail">
						<p class="quality-detail-title">{col.label}</p>
						<ValidityCard validity={col.validity} />
					</div>
				{/each}
			{/if}
		{/if}
	</section>

	<section class="section">
		<h2 class="section-title">CSV import</h2>
		<p class="section-note">Download the template, fill in data from row 2 onward (overwriting the sample row), then upload it</p>
		<button class="file-label template-btn" onclick={downloadTemplate}>
			<Download size={14} />
			Download template
		</button>
		<div class="replace-row">
			<Toggle bind:checked={replaceExisting} disabled={importing} label="Delete all existing data before importing" />
		</div>
		<FileUpload accept=".csv,text/csv" disabled={importing} onchange={handleImport} />
		{#if importing}<p class="import-result">Importing...</p>{/if}
		{#if importResult}
			<p class="import-result" class:error={importResult.startsWith('Error')}>{importResult}</p>
		{/if}
	</section>

	<section class="section">
		<h2 class="section-title">Data (first 30 rows)</h2>
		{#if !previewLoaded}
			<p class="empty-text">Loading...</p>
		{:else if previewRows.length === 0}
			<p class="empty-text">No data</p>
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

	.sync-status-badge {
		display: inline-flex;
		margin-left: 6px;
		padding: 1px 8px;
		border-radius: 999px;
		font-size: 0.6875rem;
		font-weight: 600;

		&.syncing {
			background: var(--color-info-bg);
			color: var(--color-info);
		}

		&.failed {
			background: var(--color-error-bg);
			color: var(--color-error);
		}
	}

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

	.quality-table-wrap {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}

	.quality-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;

		th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--color-border); }
		th { font-weight: 500; color: var(--color-text-muted); background: var(--color-surface); }
		tr:last-child td { border-bottom: none; }
	}

	.quality-badge {
		display: inline-flex;
		align-items: center;
		padding: 2px 9px;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		background: var(--color-neutral-bg);
		color: var(--color-neutral);

		&.level-good { background: var(--color-success-bg); color: var(--color-success); }
		&.level-caution { background: color-mix(in srgb, var(--color-warning) 12%, var(--color-background)); color: var(--color-warning); }
		&.level-poor { background: var(--color-error-bg); color: var(--color-error); }
	}

	.quality-detail {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 12px;
	}

	.quality-detail-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

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
