<script lang="ts">
	import { untrack } from 'svelte';
	import X from '$lib/components/icon/X.svelte';

	type ColumnType = 'text' | 'number' | 'date' | 'boolean';
	type InitialColumn = { key: string; label: string; type: ColumnType };
	export type FormColumn = { uid: string; originalKey?: string; key: string; label: string; type: ColumnType };

	type Props = {
		title: string;
		// In 'edit' mode, the initial columns are treated as existing columns and their type cannot be changed (deleting a column warns as a destructive operation)
		mode: 'create' | 'edit';
		initialName?: string;
		initialDescription?: string;
		initialColumns?: InitialColumn[];
		submitLabel: string;
		submitting?: boolean;
		error?: string;
		cancelHref: string;
		onsubmit: (data: { name: string; description: string; columns: FormColumn[] }) => void;
	};

	let {
		title,
		mode,
		initialName = '',
		initialDescription = '',
		initialColumns = [{ key: 'column1', label: 'Column 1', type: 'text' }],
		submitLabel,
		submitting = false,
		error = '',
		cancelHref,
		onsubmit
	}: Props = $props();

	// The initial values are a one-time snapshot from props. From here on they're edited as local form state
	let name = $state(untrack(() => initialName));
	let description = $state(untrack(() => initialDescription));

	let uidCounter = 0;
	function nextUid(): string {
		uidCounter += 1;
		return `col-${uidCounter}`;
	}

	let columns = $state<FormColumn[]>(
		untrack(() =>
			initialColumns.map((c) => ({
				uid: nextUid(),
				originalKey: mode === 'edit' ? c.key : undefined,
				key: c.key,
				label: c.label,
				type: c.type
			}))
		)
	);

	let localError = $state('');
	const displayError = $derived(localError || error);

	function addColumn() {
		columns = [...columns, { uid: nextUid(), key: '', label: '', type: 'text' }];
	}

	function removeColumn(uid: string) {
		columns = columns.filter((c) => c.uid !== uid);
	}

	const deletedCount = $derived(
		mode === 'edit' ? initialColumns.filter((c) => !columns.some((col) => col.originalKey === c.key)).length : 0
	);

	function handleSubmit() {
		localError = '';
		if (!name.trim()) {
			localError = 'Please enter a name';
			return;
		}
		if (columns.length === 0) {
			localError = 'At least one column is required';
			return;
		}
		if (columns.some((c) => !c.key.trim() || !c.label.trim())) {
			localError = 'Key and label are required';
			return;
		}
		if (new Set(columns.map((c) => c.key.trim())).size !== columns.length) {
			localError = 'Column keys must be unique';
			return;
		}
		if (deletedCount > 0 && !confirm(`This will delete ${deletedCount} column(s). Data in those columns will be lost. Are you sure?`)) {
			return;
		}
		onsubmit({
			name: name.trim(),
			description: description.trim(),
			columns: columns.map((c) => ({ ...c, key: c.key.trim(), label: c.label.trim() }))
		});
	}
</script>

<div class="page">
	<h1 class="page-title">{title}</h1>

	{#if displayError}<p class="form-error">{displayError}</p>{/if}

	<div class="field">
		<label for="ds-name">Name <span class="required">*</span></label>
		<input id="ds-name" type="text" bind:value={name} placeholder="e.g. Monthly Sales Data" />
	</div>
	<div class="field">
		<label for="ds-desc">Description</label>
		<input id="ds-desc" type="text" bind:value={description} placeholder="Description of this data source (optional)" />
	</div>

	<div class="cols-section">
		<div class="cols-header">
			<span class="cols-label">Column Definitions</span>
			<button type="button" class="btn-link" onclick={addColumn}>+ Add Column</button>
		</div>
		<div class="col-row col-row-head">
			<span class="col-key">Key (physical name, alphanumeric)</span>
			<span class="col-label">Label (Japanese allowed)</span>
			<span class="col-type">Type</span>
			<span class="col-del"></span>
		</div>
		{#each columns as col (col.uid)}
			<div class="col-row">
				<input type="text" bind:value={col.key} placeholder="advertising_cost" class="col-key mono" />
				<input type="text" bind:value={col.label} placeholder="Ad Spend" class="col-label" />
				{#if col.originalKey}
					<span class="col-type type-badge">{col.type}</span>
				{:else}
					<select bind:value={col.type} class="col-type">
						<option value="text">Text</option>
						<option value="number">Number</option>
						<option value="date">Date</option>
						<option value="boolean">Boolean</option>
					</select>
				{/if}
				<button
					type="button"
					class="btn-icon-sm col-del"
					onclick={() => removeColumn(col.uid)}
					disabled={columns.length <= 1}
					aria-label="Delete this column"
				>
					<X size={12} />
				</button>
			</div>
		{/each}
		{#if mode === 'edit'}
			<p class="cols-hint">The type of an existing column cannot be changed (create a new one instead)</p>
		{/if}
	</div>

	<div class="form-actions">
		<button type="button" class="btn-primary" onclick={handleSubmit} disabled={submitting || !name.trim()}>
			{submitting ? 'Saving...' : submitLabel}
		</button>
		<a href={cancelHref} class="btn-secondary">Cancel</a>
	</div>
</div>

<style lang="scss">
	.page {
		padding: 28px 32px;
		max-width: 740px;
		margin: 0 auto;
	}

	.page-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 20px;
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--color-error);
		margin: 0 0 12px;
	}

	.field {
		margin-bottom: 14px;

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

	.required { color: var(--color-error); }

	.cols-section { margin: 20px 0; }

	.cols-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	.cols-label { font-size: 0.8125rem; color: var(--color-text-muted); }

	.cols-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 8px 0 0;
	}

	.btn-link {
		background: none;
		border: none;
		color: var(--color-primary);
		font-size: 0.8125rem;
		cursor: pointer;
		padding: 0;
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

		.col-key { flex: 1; }
		.col-label { flex: 1.5; }
		.col-type { width: 100px; }
		.col-del { flex-shrink: 0; }

		&.col-row-head {
			span { font-size: 0.6875rem; color: var(--color-text-muted); }
		}
	}

	.type-badge {
		display: inline-flex;
		align-items: center;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
	}

	.mono { font-family: ui-monospace, monospace; }

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
		&:not(:disabled):hover { color: var(--color-error); border-color: var(--color-error); }
	}

	.form-actions {
		display: flex;
		gap: 8px;
		border-top: 1px solid var(--color-border);
		margin-top: 40px;
		padding-top: 20px;
		justify-content: flex-end;
	}

	.btn-primary {
		padding: 8px 20px;
		background: var(--color-primary);
		color: #fff;
		border: none;
		border-radius: 6px;
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
		border-radius: 6px;
		font-size: 0.875rem;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		transition: background 0.15s;

		&:hover { background: var(--color-surface); }
	}
</style>
