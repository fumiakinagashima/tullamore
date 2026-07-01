<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import X from '$lib/components/icon/X.svelte';

	type ColumnDef = { key: string; label: string; type: 'text' | 'number' | 'date' | 'boolean' };

	let creating = $state(false);
	let error = $state('');
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
		error = '';
		try {
			const res = await fetch('/api/data-sources', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined, columns: newCols })
			});
			if (!res.ok) throw new Error('作成に失敗しました');
			const source = (await res.json()) as { id: string };
			await invalidateAll();
			await goto(`/database/${source.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : '作成に失敗しました';
		} finally {
			creating = false;
		}
	}
</script>

<div class="page">
	<h1 class="page-title">新しいテーブル</h1>

	{#if error}<p class="form-error">{error}</p>{/if}

	<div class="field">
		<label for="new-name">名前 <span class="required">*</span></label>
		<input id="new-name" type="text" bind:value={newName} placeholder="例: 月次売上データ" />
	</div>
	<div class="field">
		<label for="new-desc">説明</label>
		<input id="new-desc" type="text" bind:value={newDesc} placeholder="このデータソースの説明（任意）" />
	</div>

	<div class="cols-section">
		<div class="cols-header">
			<span class="cols-label">カラム定義</span>
			<button class="btn-link" onclick={addCol}>+ 追加</button>
		</div>
		<div class="col-row col-row-head">
			<span class="col-key">キー（物理名・英数字）</span>
			<span class="col-label">ラベル（日本語可）</span>
			<span class="col-type">型</span>
			<span class="col-del"></span>
		</div>
		{#each newCols as col, i (i)}
			<div class="col-row">
				<input type="text" bind:value={col.key} placeholder="advertising_cost" class="col-key mono" />
				<input type="text" bind:value={col.label} placeholder="広告費" class="col-label" />
				<select bind:value={col.type} class="col-type">
					<option value="text">テキスト</option>
					<option value="number">数値</option>
					<option value="date">日付</option>
					<option value="boolean">真偽値</option>
				</select>
				<button class="btn-icon-sm col-del" onclick={() => removeCol(i)} disabled={newCols.length <= 1}>
					<X size={12} />
				</button>
			</div>
		{/each}
	</div>

	<div class="form-actions">
		<button class="btn-primary" onclick={createDataSource} disabled={creating || !newName.trim()}>
			{creating ? '作成中...' : '作成'}
		</button>
		<a href="/database" class="btn-secondary">キャンセル</a>
	</div>
</div>

<style lang="scss">
	.page {
		padding: 28px 32px;
		max-width: 640px;
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
		margin-top: 20px;
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
