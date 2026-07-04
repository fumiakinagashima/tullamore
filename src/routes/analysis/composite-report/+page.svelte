<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import type { LinearRegressionModel } from '$lib/analysis/types';
	import type { ValidityAssessment } from '$lib/analysis/validity';
	import type { CorrelationMatrix } from '$lib/analysis/correlation-matrix';
	import type { DescriptiveStatsSummary } from '$lib/analysis/descriptive-stats';
	import { continuousColumns } from '$lib/analysis/column-type';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';
	import CorrelationHeatmap from '$lib/components/ui/CorrelationHeatmap.svelte';
	import ReportModal from '$lib/components/analysis/ReportModal.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	let dataSourceId = $state('');
	let targetColumn = $state('');
	let featureColumns = $state<string[]>([]);
	let loading = $state(false);
	let error = $state('');

	type AnalysisEntry = { analysisType: string; label: string; config: Record<string, unknown>; resultSummary: Record<string, unknown> };
	let regressionEntry = $state<AnalysisEntry | null>(null);
	let correlationEntry = $state<AnalysisEntry | null>(null);
	let descriptiveEntry = $state<AnalysisEntry | null>(null);

	let regressionModel = $state<LinearRegressionModel | null>(null);
	let regressionValidity = $state<ValidityAssessment | null>(null);
	let correlationMatrix = $state<CorrelationMatrix | null>(null);
	let correlationValidity = $state<ValidityAssessment | null>(null);
	let descriptiveStats = $state<DescriptiveStatsSummary | null>(null);

	let reportModalOpen = $state(false);
	let reportLoading = $state(false);
	let report = $state<string | null>(null);
	let reportError = $state<string | null>(null);

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	const numericColumns = $derived(selectedSource ? continuousColumns(selectedSource.columns) : []);
	const targetOptions = $derived(numericColumns.map((c) => ({ value: c.key, label: c.label })));
	const featureCandidates = $derived(numericColumns.filter((c) => c.key !== targetColumn));
	const sourceOptions = $derived(data.sources.map((s) => ({ value: s.id, label: s.name })));

	function labelOf(key: string): string {
		return selectedSource?.columns.find((c) => c.key === key)?.label ?? key;
	}

	function resetResults() {
		regressionEntry = null;
		correlationEntry = null;
		descriptiveEntry = null;
		regressionModel = null;
		regressionValidity = null;
		correlationMatrix = null;
		correlationValidity = null;
		descriptiveStats = null;
	}

	$effect(() => {
		dataSourceId;
		targetColumn = '';
		featureColumns = [];
		resetResults();
		error = '';
	});

	function toggleFeature(key: string, checked: boolean) {
		featureColumns = checked ? [...featureColumns, key] : featureColumns.filter((k) => k !== key);
	}

	const canRun = $derived(!!dataSourceId && !!targetColumn && featureColumns.length > 0);
	const hasResults = $derived(!!regressionEntry && !!correlationEntry && !!descriptiveEntry);

	// このページの「レポートを作成」はAIアシスタント欄の汎用ボタンではなく画面上の専用ボタンを使う
	// （複数分析を束ねるため resultSummary は単一分析用のレポート生成に流用しない。null のままにしてボタンを非表示にする）
	$effect(() => {
		bridge.analysisType = 'composite-report';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			target_column: targetColumn || undefined,
			feature_columns: featureColumns.length > 0 ? featureColumns : undefined
		};
		bridge.resultSummary = null;
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
		resetResults();
		try {
			const [regRes, corrRes, descRes] = await Promise.all([
				fetch('/api/analysis/regression', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ dataSourceId, targetColumn, featureColumns })
				}),
				fetch('/api/analysis/correlation', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ dataSourceId, columns: [targetColumn, ...featureColumns] })
				}),
				fetch('/api/analysis/descriptive-stats', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ dataSourceId, columns: [targetColumn] })
				})
			]);

			const regBody = (await regRes.json()) as { model?: LinearRegressionModel; validity?: ValidityAssessment; error?: string };
			if (!regRes.ok) throw new Error(regBody.error ?? '回帰分析に失敗しました');
			regressionModel = regBody.model ?? null;
			regressionValidity = regBody.validity ?? null;

			const corrBody = (await corrRes.json()) as { matrix?: CorrelationMatrix; validity?: ValidityAssessment; error?: string };
			if (!corrRes.ok) throw new Error(corrBody.error ?? '相関分析に失敗しました');
			correlationMatrix = corrBody.matrix ?? null;
			correlationValidity = corrBody.validity ?? null;

			const descBody = (await descRes.json()) as { stats?: Record<string, DescriptiveStatsSummary>; error?: string };
			if (!descRes.ok) throw new Error(descBody.error ?? '記述統計に失敗しました');
			descriptiveStats = descBody.stats?.[targetColumn] ?? null;

			const commonConfig = { data_source_id: dataSourceId, target_column: targetColumn, feature_columns: featureColumns };

			if (regressionModel && regressionValidity) {
				regressionEntry = {
					analysisType: 'regression',
					label: '回帰分析',
					config: commonConfig,
					resultSummary: {
						r2: regressionModel.metrics.r2,
						adjusted_r2: regressionModel.metrics.adjustedR2,
						sample_size: regressionModel.metrics.sampleSize,
						coefficients: Object.fromEntries(regressionModel.featureColumns.map((c, i) => [c, regressionModel!.coefficients[i]])),
						validity: { overall: regressionValidity.overallLevel, comment: regressionValidity.overallComment }
					}
				};
			}
			if (correlationMatrix && correlationValidity) {
				correlationEntry = {
					analysisType: 'correlation',
					label: '相関分析',
					config: { data_source_id: dataSourceId, feature_columns: [targetColumn, ...featureColumns] },
					resultSummary: {
						columns: correlationMatrix.columns,
						sample_size: correlationMatrix.sampleSize,
						strongest_pair: strongestPair
							? { a: labelOf(strongestPair.a), b: labelOf(strongestPair.b), correlation: strongestPair.value }
							: null,
						validity: { overall: correlationValidity.overallLevel, comment: correlationValidity.overallComment }
					}
				};
			}
			if (descriptiveStats) {
				descriptiveEntry = {
					analysisType: 'descriptive-stats',
					label: '記述統計',
					config: { data_source_id: dataSourceId, feature_columns: [targetColumn] },
					resultSummary: {
						target_column: targetColumn,
						n: descriptiveStats.n,
						mean: descriptiveStats.mean,
						median: descriptiveStats.median,
						stddev: descriptiveStats.stddev,
						outlier_count: descriptiveStats.outlierCount,
						validity: { overall: descriptiveStats.validity.overallLevel, comment: descriptiveStats.validity.overallComment }
					}
				};
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	const strongestPair = $derived.by(() => {
		if (!correlationMatrix) return null;
		let best: { a: string; b: string; value: number } | null = null;
		for (let i = 0; i < correlationMatrix.columns.length; i++) {
			for (let j = i + 1; j < correlationMatrix.columns.length; j++) {
				const value = correlationMatrix.matrix[i][j];
				if (!best || Math.abs(value) > Math.abs(best.value)) {
					best = { a: correlationMatrix.columns[i], b: correlationMatrix.columns[j], value };
				}
			}
		}
		return best;
	});

	const heatmapColumns = $derived(correlationMatrix ? correlationMatrix.columns.map((key) => ({ key, label: labelOf(key) })) : []);

	async function createReport() {
		const analyses = [regressionEntry, correlationEntry, descriptiveEntry].filter((e): e is AnalysisEntry => !!e);
		if (analyses.length === 0) return;
		reportModalOpen = true;
		reportLoading = true;
		report = null;
		reportError = null;
		try {
			const res = await fetch('/api/analysis/composite-report', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ analyses: analyses.map(({ analysisType, config, resultSummary }) => ({ analysisType, config, resultSummary })) })
			});
			const body = (await res.json()) as { report?: string; error?: string };
			if (!res.ok) throw new Error(body.error ?? 'レポートの作成に失敗しました');
			report = body.report ?? null;
		} catch (e) {
			reportError = e instanceof Error ? e.message : String(e);
		} finally {
			reportLoading = false;
		}
	}

	const numberFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">複合分析レポート</h1>
		<p class="page-sub">相関分析・回帰分析・記述統計を同じデータに対して同時に実行し、手法間の結論の一致・矛盾を踏まえた統合レポートを作成します</p>
	</div>

	<section class="results-panel">
		{#if hasResults}
			<div class="analysis-grid">
				<div class="analysis-card">
					<p class="analysis-title">相関分析</p>
					{#if correlationValidity}<ValidityCard validity={correlationValidity} />{/if}
					{#if strongestPair}
						<p class="mini-note">
							最も相関が強いのは「{labelOf(strongestPair.a)}」と「{labelOf(strongestPair.b)}」（r = {fmt(strongestPair.value)}）
						</p>
					{/if}
					{#if correlationMatrix}
						<CorrelationHeatmap columns={heatmapColumns} matrix={correlationMatrix.matrix} />
					{/if}
				</div>

				<div class="analysis-card">
					<p class="analysis-title">回帰分析</p>
					{#if regressionValidity}<ValidityCard validity={regressionValidity} />{/if}
					{#if regressionModel}
						<div class="metrics-row">
							<div class="metric"><span class="metric-label">R²</span><span class="metric-value highlight">{fmt(regressionModel.metrics.r2)}</span></div>
							<div class="metric"><span class="metric-label">サンプル数</span><span class="metric-value">{regressionModel.metrics.sampleSize}</span></div>
						</div>
						<ul class="coef-list">
							{#each regressionModel.featureColumns as key, i (key)}
								<li>{labelOf(key)}: <strong>{fmt(regressionModel.coefficients[i])}</strong></li>
							{/each}
						</ul>
					{/if}
				</div>

				<div class="analysis-card">
					<p class="analysis-title">記述統計（{labelOf(targetColumn)}）</p>
					{#if descriptiveStats}
						<ValidityCard validity={descriptiveStats.validity} />
						<div class="metrics-row">
							<div class="metric"><span class="metric-label">件数</span><span class="metric-value">{descriptiveStats.n.toLocaleString()}</span></div>
							<div class="metric"><span class="metric-label">平均</span><span class="metric-value highlight">{fmt(descriptiveStats.mean)}</span></div>
							<div class="metric"><span class="metric-label">中央値</span><span class="metric-value">{fmt(descriptiveStats.median)}</span></div>
							<div class="metric"><span class="metric-label">標準偏差</span><span class="metric-value">{fmt(descriptiveStats.stddev)}</span></div>
						</div>
					{/if}
				</div>
			</div>

			<div class="report-row">
				<button class="run-btn" onclick={createReport}>複合レポートを作成</button>
			</div>
		{:else}
			<div class="empty-results">
				<p>下の設定欄でデータソース・目的変数・説明変数を選び、「分析を実行」を押してください</p>
			</div>
		{/if}
	</section>

	<section class="config-panel">
		<p class="config-title">設定</p>
		<div class="config-row">
			<Select label="データソース" bind:value={dataSourceId} options={sourceOptions} />
			<Select label="目的変数" bind:value={targetColumn} options={targetOptions} disabled={!dataSourceId} />
		</div>

		<div class="feature-picker">
			<span class="field-label">説明変数（複数選択可）</span>
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
				{loading ? '分析中…' : '分析を実行'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>
</div>

<ReportModal
	open={reportModalOpen}
	loading={reportLoading}
	report={report}
	error={reportError}
	onClose={() => (reportModalOpen = false)}
/>

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

	.analysis-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 16px;
		margin-bottom: 18px;
	}

	.analysis-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 18px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
	}

	.analysis-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.mini-note {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.metrics-row {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
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

		&.highlight { color: var(--color-primary); font-size: 1.0625rem; }
	}

	.coef-list {
		margin: 0;
		padding-left: 1.2em;
		font-size: 0.8125rem;
		color: var(--color-text);
	}

	.report-row {
		display: flex;
		justify-content: flex-end;
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
