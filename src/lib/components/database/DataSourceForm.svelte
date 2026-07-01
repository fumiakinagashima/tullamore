<script lang="ts">
	import { untrack } from 'svelte';
	import X from '$lib/components/icon/X.svelte';

	type ColumnType = 'text' | 'number' | 'date' | 'boolean';
	type InitialColumn = { key: string; label: string; type: ColumnType };
	export type FormColumn = { uid: string; originalKey?: string; key: string; label: string; type: ColumnType };

	type Props = {
		title: string;
		// 'edit' では初期カラムを既存列として扱い、型を変更不可にする（列削除は破壊的操作として警告する）
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
		initialColumns = [{ key: 'column1', label: 'カラム1', type: 'text' }],
		submitLabel,
		submitting = false,
		error = '',
		cancelHref,
		onsubmit
	}: Props = $props();

	// 初期値は props からの一度きりのスナップショット。以降はローカルなフォーム状態として編集する
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
			localError = '名前を入力してください';
			return;
		}
		if (columns.length === 0) {
			localError = '少なくとも1つの列が必要です';
			return;
		}
		if (columns.some((c) => !c.key.trim() || !c.label.trim())) {
			localError = 'キーとラベルは必須です';
			return;
		}
		if (new Set(columns.map((c) => c.key.trim())).size !== columns.length) {
			localError = 'カラムキーが重複しています';
			return;
		}
		if (deletedCount > 0 && !confirm(`${deletedCount}件の列を削除します。該当する列のデータは失われます。よろしいですか？`)) {
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
		<label for="ds-name">名前 <span class="required">*</span></label>
		<input id="ds-name" type="text" bind:value={name} placeholder="例: 月次売上データ" />
	</div>
	<div class="field">
		<label for="ds-desc">説明</label>
		<input id="ds-desc" type="text" bind:value={description} placeholder="このデータソースの説明（任意）" />
	</div>

	<div class="cols-section">
		<div class="cols-header">
			<span class="cols-label">カラム定義</span>
			<button type="button" class="btn-link" onclick={addColumn}>+ カラム追加</button>
		</div>
		<div class="col-row col-row-head">
			<span class="col-key">キー（物理名・英数字）</span>
			<span class="col-label">ラベル（日本語可）</span>
			<span class="col-type">型</span>
			<span class="col-del"></span>
		</div>
		{#each columns as col (col.uid)}
			<div class="col-row">
				<input type="text" bind:value={col.key} placeholder="advertising_cost" class="col-key mono" />
				<input type="text" bind:value={col.label} placeholder="広告費" class="col-label" />
				{#if col.originalKey}
					<span class="col-type type-badge">{col.type}</span>
				{:else}
					<select bind:value={col.type} class="col-type">
						<option value="text">テキスト</option>
						<option value="number">数値</option>
						<option value="date">日付</option>
						<option value="boolean">真偽値</option>
					</select>
				{/if}
				<button
					type="button"
					class="btn-icon-sm col-del"
					onclick={() => removeColumn(col.uid)}
					disabled={columns.length <= 1}
					aria-label="この列を削除"
				>
					<X size={12} />
				</button>
			</div>
		{/each}
		{#if mode === 'edit'}
			<p class="cols-hint">既存列の型は変更できません（新規に作成し直してください）</p>
		{/if}
	</div>

	<div class="form-actions">
		<button type="button" class="btn-primary" onclick={handleSubmit} disabled={submitting || !name.trim()}>
			{submitting ? '保存中...' : submitLabel}
		</button>
		<a href={cancelHref} class="btn-secondary">キャンセル</a>
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
