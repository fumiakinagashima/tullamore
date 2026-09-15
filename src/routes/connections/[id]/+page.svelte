<script lang="ts">
	import { goto } from '$app/navigation';
	import Textbox from '$lib/components/ui/Textbox.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type ImportColumn = {
		externalName: string;
		dataType: string;
		key: string;
		label: string;
		type: 'text' | 'number' | 'date' | 'boolean';
	};

	let openTableKey = $state<string | null>(null);
	let name = $state('');
	let description = $state('');
	let columns = $state<ImportColumn[]>([]);
	let submitting = $state(false);
	let error = $state('');

	function tableKey(t: { schema: string; name: string }): string {
		return `${t.schema}.${t.name}`;
	}

	function openTable(t: { schema: string; name: string; columns: ImportColumn[] }) {
		const key = tableKey(t);
		if (openTableKey === key) {
			openTableKey = null;
			return;
		}
		openTableKey = key;
		name = t.name;
		description = '';
		columns = t.columns.map((c) => ({ ...c }));
		error = '';
	}

	async function importTable(t: { schema: string; name: string }) {
		error = '';
		if (!name.trim()) {
			error = 'Please enter a name';
			return;
		}
		if (columns.some((c) => !c.key.trim() || !c.label.trim())) {
			error = 'Key and label are required';
			return;
		}
		if (new Set(columns.map((c) => c.key.trim())).size !== columns.length) {
			error = 'Column keys are duplicated';
			return;
		}
		submitting = true;
		try {
			const res = await fetch(`/api/db-connections/${data.connection.id}/sync`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					externalSchema: t.schema,
					externalTable: t.name,
					name: name.trim(),
					description: description.trim() || undefined,
					columns: columns.map((c) => ({
						key: c.key.trim(),
						label: c.label.trim(),
						type: c.type,
						externalName: c.externalName
					}))
				})
			});
			const body = (await res.json()) as { dataSourceId?: string; error?: string };
			if (!res.ok) {
				error = body.error ?? 'Import failed';
				return;
			}
			goto(`/database/${body.dataSourceId}`);
		} finally {
			submitting = false;
		}
	}
</script>

<div class="page">
	<a href="/connections" class="back-link">← Connections</a>
	<h1 class="page-title">{data.connection.name}</h1>
	<p class="page-sub">
		{#if data.connection.provider === 'hyperdrive'}
			Binding: {data.connection.config.bindingName}
		{:else}
			{data.connection.config.host}:{data.connection.config.port}/{data.connection.config.database}
		{/if}
	</p>

	{#if data.tablesError}
		<p class="error-box">Connection failed: {data.tablesError}</p>
	{:else if data.tables.length === 0}
		<p class="empty">No importable tables were found</p>
	{:else}
		<ul class="table-list">
			{#each data.tables as t (tableKey(t))}
				<li class="table-item">
					<button type="button" class="table-row" onclick={() => openTable(t)}>
						<span class="table-name">{t.schema}.{t.name}</span>
						<span class="table-cols">{t.columns.length} columns</span>
					</button>

					{#if openTableKey === tableKey(t)}
						<div class="import-panel">
							{#if error}<p class="form-error">{error}</p>{/if}
							<div class="fields">
								<Textbox label="Data Source Name" bind:value={name} required />
								<Textbox label="Description" bind:value={description} />
							</div>

							<div class="col-row col-row-head">
								<span class="col-ext">External Column Name</span>
								<span class="col-key">Key (physical name)</span>
								<span class="col-label">Label</span>
								<span class="col-type">Type</span>
							</div>
							{#each columns as col, i (col.externalName)}
								<div class="col-row">
									<span class="col-ext mono">{col.externalName}</span>
									<input type="text" bind:value={columns[i].key} class="col-key mono" />
									<input type="text" bind:value={columns[i].label} class="col-label" />
									<select bind:value={columns[i].type} class="col-type">
										<option value="text">Text</option>
										<option value="number">Number</option>
										<option value="date">Date</option>
										<option value="boolean">Boolean</option>
									</select>
								</div>
							{/each}

							<div class="import-actions">
								<button type="button" class="import-btn" onclick={() => importTable(t)} disabled={submitting}>
									{submitting ? 'Importing…' : 'Import This Table'}
								</button>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	.page {
		padding: 28px 32px 60px;
		width: 100%;
		max-width: var(--body-width-md);
		margin: 0 auto;
	}

	.back-link {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		text-decoration: none;
		display: inline-block;
		margin-bottom: 12px;

		&:hover { color: var(--color-text); }
	}

	.page-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 4px;
	}

	.page-sub {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		font-family: ui-monospace, monospace;
		margin: 0 0 24px;
	}

	.error-box {
		padding: 14px 16px;
		border-radius: 8px;
		background: var(--color-error-bg);
		color: var(--color-error);
		font-size: 0.875rem;
	}

	.empty {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		text-align: center;
		margin-top: 40px;
	}

	.table-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.table-item {
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-surface);
		overflow: hidden;
	}

	.table-row {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: var(--color-text);

		&:hover { background: var(--color-background); }
	}

	.table-name {
		font-size: 0.9375rem;
		font-weight: 500;
		font-family: ui-monospace, monospace;
	}

	.table-cols {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.import-panel {
		padding: 16px;
		border-top: 1px solid var(--color-border);
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--color-error);
		margin: 0 0 12px;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 16px;
	}

	.col-row {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-bottom: 6px;

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

		.col-ext { flex: 1; color: var(--color-text-muted); font-size: 0.8125rem; }
		.col-key { flex: 1; }
		.col-label { flex: 1; }
		.col-type { width: 100px; }

		&.col-row-head span {
			font-size: 0.6875rem;
			color: var(--color-text-muted);
		}
	}

	.mono { font-family: ui-monospace, monospace; }

	.import-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 14px;
	}

	.import-btn {
		padding: 8px 18px;
		background: var(--color-primary);
		color: #fff;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;

		&:disabled { opacity: 0.5; cursor: not-allowed; }
		&:not(:disabled):hover { opacity: 0.85; }
	}
</style>
