<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import type { LogisticRegressionModel } from '$lib/analysis/methods/logistic-regression';
	import { continuousColumns, inferAnalysisColumnType } from '$lib/analysis/column-type';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Table from '$lib/components/ui/Table.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	let dataSourceId = $state('');
	let targetColumn = $state('');
	let featureColumns = $state<string[]>([]);
	let loading = $state(false);
	let error = $state('');
	let model = $state<LogisticRegressionModel | null>(null);
	let truncated = $state(false);

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	// 目的変数は2値であれば数値・カテゴリどちらの列でもよい（id/date列は除外）
	const targetCandidates = $derived(
		selectedSource?.columns.filter((c) => {
			const t = inferAnalysisColumnType(c);
			return t !== 'id' && t !== 'date';
		}) ?? []
	);
	const numericColumns = $derived(selectedSource ? continuousColumns(selectedSource.columns) : []);
	const featureCandidates = $derived(numericColumns.filter((c) => c.key !== targetColumn));
	const targetOptions = $derived(targetCandidates.map((c) => ({ value: c.key, label: c.label })));
	const sourceOptions = $derived(data.sources.map((s) => ({ value: s.id, label: s.name })));

	function labelOf(key: string): string {
		return selectedSource?.columns.find((c) => c.key === key)?.label ?? key;
	}

	$effect(() => {
		dataSourceId;
		targetColumn = '';
		featureColumns = [];
		model = null;
		error = '';
	});

	function toggleFeature(key: string, checked: boolean) {
		featureColumns = checked ? [...featureColumns, key] : featureColumns.filter((k) => k !== key);
	}

	const canRun = $derived(!!dataSourceId && !!targetColumn && featureColumns.length > 0);

	$effect(() => {
		bridge.analysisType = 'classification';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			target_column: targetColumn || undefined,
			feature_columns: featureColumns.length > 0 ? featureColumns : undefined
		};
		bridge.resultSummary = model
			? {
					positive_class: model.positiveClassLabel,
					accuracy: model.metrics.accuracy,
					precision: model.metrics.precision,
					recall: model.metrics.recall,
					f1: model.metrics.f1,
					pseudo_r2: model.metrics.pseudoR2,
					converged: model.metrics.converged
				}
			: null;
	});

	async function applyConfig(patch: Record<string, unknown>) {
		if (typeof patch.data_source_id === 'string' && patch.data_source_id !== dataSourceId) {
			dataSourceId = patch.data_source_id;
			await tick();
		}
		if (typeof patch.target_column === 'string') targetColumn = patch.target_column;
		if (Array.isArray(patch.feature_columns)) {
			featureColumns = patch.feature_columns.filter((c): c is string => typeof c === 'string');
		}
		await tick();
		if (canRun) await run();
	}

	$effect(() => {
		bridge.applyConfig = applyConfig;
		return () => {
			if (bridge.applyConfig === applyConfig) bridge.applyConfig = null;
		};
	});

	async function run() {
		if (!canRun) return;
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/analysis/classification', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataSourceId, targetColumn, featureColumns })
			});
			const body = (await res.json()) as { model?: LogisticRegressionModel; truncated?: boolean; error?: string };
			if (!res.ok) throw new Error(body.error ?? '分析に失敗しました');
			model = body.model ?? null;
			truncated = body.truncated ?? false;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	const numberFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}
	function fmtPct(n: number): string {
		return `${(n * 100).toFixed(1)}%`;
	}

	const coefficientRows = $derived(
		model
			? model.featureColumns.map((key, i) => ({
					variable: labelOf(key),
					coefficient: fmt(model!.coefficients[i]),
					odds_ratio: fmt(Math.exp(model!.coefficients[i]))
				}))
			: []
	);
	const coefficientColumns = [
		{ key: 'variable', label: '説明変数' },
		{ key: 'coefficient', label: '係数（対数オッズ）' },
		{ key: 'odds_ratio', label: 'オッズ比' }
	];
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">ロジスティック回帰・分類</h1>
		<p class="page-sub">目的変数が2値（購入した/しない、解約した/しない等）の場合に、説明変数からその確率を予測するモデルを作ります</p>
	</div>

	<section class="results-panel">
		{#if model}
			<div class="results-card">
				{#if !model.metrics.converged}
					<p class="warning-text">学習が収束しませんでした（最大反復回数に達しました）。係数の信頼性が低い可能性があります。</p>
				{/if}
				{#if truncated}
					<p class="warning-text">データ件数が多いため先頭の一部（{model.metrics.sampleSize.toLocaleString()}件）のみで学習しました。</p>
				{/if}
				<p class="positive-class-note">正例（1）として扱った値: <strong>{model.positiveClassLabel}</strong></p>

				<div class="content-row">
					<div class="confusion-matrix">
						<p class="subsection-title">混同行列</p>
						<table class="cm-table">
							<thead>
								<tr>
									<th></th>
									<th>予測: 正例</th>
									<th>予測: 負例</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<th>実際: 正例</th>
									<td class="cm-correct">{model.confusionMatrix.truePositive}</td>
									<td>{model.confusionMatrix.falseNegative}</td>
								</tr>
								<tr>
									<th>実際: 負例</th>
									<td>{model.confusionMatrix.falsePositive}</td>
									<td class="cm-correct">{model.confusionMatrix.trueNegative}</td>
								</tr>
							</tbody>
						</table>
					</div>

					<div class="metrics-row">
						<div class="metric">
							<span class="metric-label">正解率</span>
							<span class="metric-value highlight">{fmtPct(model.metrics.accuracy)}</span>
						</div>
						<div class="metric">
							<span class="metric-label">適合率</span>
							<span class="metric-value">{fmtPct(model.metrics.precision)}</span>
						</div>
						<div class="metric">
							<span class="metric-label">再現率</span>
							<span class="metric-value">{fmtPct(model.metrics.recall)}</span>
						</div>
						<div class="metric">
							<span class="metric-label">F1スコア</span>
							<span class="metric-value">{fmt(model.metrics.f1)}</span>
						</div>
						<div class="metric">
							<span class="metric-label">疑似R²（McFadden）</span>
							<span class="metric-value">{fmt(model.metrics.pseudoR2)}</span>
						</div>
						<div class="metric">
							<span class="metric-label">サンプル数</span>
							<span class="metric-value">{model.metrics.sampleSize.toLocaleString()}</span>
						</div>
					</div>
				</div>

				<div>
					<p class="subsection-title">係数（オッズ比が1より大きい＝正例になりやすい方向に働く）</p>
					<Table columns={coefficientColumns} rows={coefficientRows} />
				</div>
			</div>
		{:else}
			<div class="empty-results">
				<p>下の設定欄でデータソース・目的変数（2値）・説明変数を選び、「モデルを作成」を押してください</p>
			</div>
		{/if}
	</section>

	<section class="config-panel">
		<p class="config-title">設定</p>
		<div class="config-row">
			<Select label="データソース" bind:value={dataSourceId} options={sourceOptions} />
			<Select label="目的変数（2値）" bind:value={targetColumn} options={targetOptions} disabled={!dataSourceId} />
		</div>

		<div class="feature-picker">
			<span class="field-label">説明変数（数値列、複数選択可）</span>
			{#if !targetColumn}
				<p class="hint">先に目的変数を選択してください</p>
			{:else if featureCandidates.length === 0}
				<p class="hint">選択できる数値列がありません</p>
			{:else}
				<div class="checkbox-list">
					{#each featureCandidates as col (col.key)}
						<label class="checkbox-item">
							<input
								type="checkbox"
								checked={featureColumns.includes(col.key)}
								onchange={(e) => toggleFeature(col.key, e.currentTarget.checked)}
							/>
							{col.label}
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<div class="run-row">
			<button class="run-btn" onclick={run} disabled={!canRun || loading}>
				{loading ? 'モデル作成中…' : 'モデルを作成'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>
</div>

<style lang="scss">
	.module-page {
		padding: 24px 32px 40px;
	}

	.page-header { margin-bottom: 20px; }
	.page-title { font-size: 1.125rem; font-weight: 600; color: var(--color-text); margin: 0 0 4px; }
	.page-sub { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0; }

	.results-panel { margin-bottom: 24px; }

	.empty-results {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 220px;
		padding: 24px;
		background: var(--color-surface);
		border: 1px dashed var(--color-border);
		border-radius: 10px;
		text-align: center;

		p {
			font-size: 0.8125rem;
			color: var(--color-text-muted);
			margin: 0;
		}
	}

	.results-card {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 18px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	.warning-text {
		font-size: 0.8125rem;
		color: var(--color-warning);
		background: var(--color-neutral-bg);
		border-radius: 6px;
		padding: 8px 12px;
		margin: 0;
	}

	.positive-class-note {
		font-size: 0.8125rem;
		color: var(--color-text);
		margin: 0;
	}

	.content-row {
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
	}

	.subsection-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		margin: 0 0 8px;
	}

	.cm-table {
		border-collapse: collapse;
		font-size: 0.8125rem;

		th, td {
			padding: 8px 12px;
			border: 1px solid var(--color-border);
			text-align: center;
		}
		th {
			color: var(--color-text-muted);
			font-weight: 500;
		}
		.cm-correct {
			font-weight: 700;
			color: var(--color-primary);
		}
	}

	.metrics-row {
		display: flex;
		flex-wrap: wrap;
		gap: 16px 24px;
		align-content: flex-start;
		flex: 1;
	}

	.metric {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.metric-label { font-size: 0.6875rem; color: var(--color-text-muted); }
	.metric-value {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);

		&.highlight { color: var(--color-primary); font-size: 1.125rem; }
	}

	.config-panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 18px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	.config-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
		margin: 0;
	}

	.config-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 320px));
		gap: 12px;
	}

	.feature-picker {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.checkbox-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8125rem;
		color: var(--color-text);
		cursor: pointer;
	}

	.run-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.run-btn {
		padding: 8px 18px;
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

	.error-text {
		font-size: 0.8125rem;
		color: var(--color-error);
		margin: 0;
	}
</style>
