<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

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
			const json = (await res.json()) as { columns?: string[]; rows?: Record<string, unknown>[]; message?: string };
			if (!res.ok) {
				sqlError = json.message ?? '実行に失敗しました';
				return;
			}
			sqlResult = { columns: json.columns ?? [], rows: json.rows ?? [] };
		} finally {
			sqlRunning = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			runSql();
		}
	}
</script>

<div class="page">
	<h1 class="page-title">SQLクエリ</h1>

	{#if data.sources.length > 0}
		<div class="tables-ref">
			<span class="tables-ref-label">テーブル一覧:</span>
			{#each data.sources as source (source.id)}
				<span class="table-chip mono">{source.tableName}</span>
			{/each}
		</div>
	{/if}

	<textarea
		bind:value={sqlInput}
		onkeydown={handleKeydown}
		class="sql-textarea"
		placeholder={`SELECT * FROM \`${data.sources[0]?.tableName ?? 'table_name'}\` LIMIT 100`}
		rows="6"
	></textarea>
	<div class="run-row">
		<button class="btn-primary" onclick={runSql} disabled={sqlRunning || !sqlInput.trim()}>
			{sqlRunning ? '実行中...' : '実行'}
		</button>
		<span class="hint">⌘/Ctrl + Enter でも実行できます（SELECT文のみ）</span>
	</div>

	{#if sqlError}
		<p class="sql-error">{sqlError}</p>
	{/if}

	{#if sqlResult}
		<div class="result-wrap">
			<p class="result-count">{sqlResult.rows.length}件</p>
			{#if sqlResult.rows.length === 0}
				<p class="empty-text">結果がありません</p>
			{:else}
				<div class="table-wrap">
					<table class="data-table">
						<thead><tr>{#each sqlResult.columns as col (col)}<th>{col}</th>{/each}</tr></thead>
						<tbody>
							{#each sqlResult.rows as row, i (i)}
								<tr>{#each sqlResult.columns as col (col)}<td>{row[col] ?? ''}</td>{/each}</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style lang="scss">
	.page {
		padding: 28px 32px;
		max-width: 1040px;
	}

	.page-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 16px;
	}

	.tables-ref {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 12px;
	}

	.tables-ref-label {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin-right: 2px;
	}

	.table-chip {
		font-size: 0.75rem;
		padding: 2px 8px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 999px;
		color: var(--color-text-muted);
	}

	.mono { font-family: ui-monospace, monospace; }

	.sql-textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 12px 14px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-surface);
		color: var(--color-text);
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
		resize: vertical;
		outline: none;

		&:focus { border-color: var(--color-primary); }
	}

	.run-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 10px;
	}

	.hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
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

	.sql-error {
		font-size: 0.8125rem;
		color: var(--color-error);
		margin-top: 12px;
		font-family: ui-monospace, monospace;
	}

	.result-wrap { margin-top: 20px; }

	.result-count { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0 0 8px; }

	.empty-text { font-size: 0.875rem; color: var(--color-text-muted); }

	.table-wrap { overflow-x: auto; }

	.data-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
		font-family: ui-monospace, monospace;

		th, td { padding: 7px 10px; text-align: left; border-bottom: 1px solid var(--color-border); white-space: nowrap; }
		th { font-weight: 500; color: var(--color-text-muted); background: var(--color-surface); }
	}
</style>
