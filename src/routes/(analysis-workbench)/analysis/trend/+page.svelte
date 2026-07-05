<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import { continuousColumns } from '$lib/analysis/column-type';
	import { fitTrendFromRows, buildTrendSeries, type TrendRawRow, type TrendGranularity } from '$lib/analysis/trend';
	import { assessFitQuality, assessSampleSizeAdequacy, combineOverall, type ValidityAssessment } from '$lib/analysis/validity';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import LineChart from '$lib/components/ui/LineChart.svelte';
	import DataGrid from '$lib/components/ui/DataGrid.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textbox from '$lib/components/ui/Textbox.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	const HORIZON_OPTIONS = [
		{ value: '6', label: '半年後まで' },
		{ value: '12', label: '1年後まで' },
		{ value: '60', label: '5年後まで' }
	];

	const GRANULARITY_OPTIONS = [
		{ value: 'day', label: '日次' },
		{ value: 'week', label: '週次' },
		{ value: 'month', label: '月次' }
	];

	let dataSourceId = $state('');
	let dateColumn = $state('');
	let targetColumn = $state('');
	let horizonMonths = $state('12');
	// Select は string を bindable として扱うため string で持ち、使用時に TrendGranularity へ絞る（値はGRANULARITY_OPTIONSの3種のみ）
	let granularityValue = $state('month');
	const granularity = $derived(granularityValue as TrendGranularity);
	let note = $state('');
	let loading = $state(false);
	let error = $state('');
	let rows = $state<TrendRawRow[]>([]);
	let truncated = $state(false);

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	const dateOptions = $derived(
		(selectedSource?.columns ?? []).filter((c) => c.type === 'date').map((c) => ({ value: c.key, label: c.label }))
	);
	const targetOptions = $derived(
		selectedSource ? continuousColumns(selectedSource.columns).map((c) => ({ value: c.key, label: c.label })) : []
	);
	const sourceOptions = $derived(data.sources.map((s) => ({ value: s.id, label: s.name })));

	function labelOf(key: string): string {
		return selectedSource?.columns.find((c) => c.key === key)?.label ?? key;
	}

	$effect(() => {
		dataSourceId;
		dateColumn = '';
		targetColumn = '';
		rows = [];
		error = '';
	});

	const canRun = $derived(!!dataSourceId && !!dateColumn && !!targetColumn);

	const gridColumns = $derived([
		{ key: 'date', label: labelOf(dateColumn) || '日付', type: 'date' as const },
		{ key: 'value', label: labelOf(targetColumn) || '数値', type: 'number' as const }
	]);

	// グリッドの数値を編集すると、サーバー往復なしでその場で再学習・再計算する（回帰分析シミュレーターのスライダーと同じ考え方）
	const liveModel = $derived.by(() => {
		if (rows.length === 0) return null;
		try {
			return fitTrendFromRows(rows);
		} catch {
			return null;
		}
	});

	const liveSeries = $derived.by(() => {
		if (!liveModel) return null;
		try {
			return buildTrendSeries(rows, liveModel, Number(horizonMonths), granularity);
		} catch {
			return null;
		}
	});

	// トレンド予測は説明変数が「時間」の1個のみ（TREND_TIME_FEATURE）なので多重共線性チェックは対象外。
	// D1に問い合わせる必要が無いためクライアント側で完結する（サーバー往復なし、他の計算と同じ考え方）
	const validity = $derived.by<ValidityAssessment | null>(() => {
		const m = liveModel;
		if (!m) return null;
		const checks = [assessFitQuality(m.metrics.r2), assessSampleSizeAdequacy(m.metrics.sampleSize, m.featureColumns.length)];
		const { overallLevel, overallComment } = combineOverall(checks, 'このトレンド予測は妥当性チェックの主要な観点で問題は見つかりませんでした');
		return { overallLevel, overallComment, checks };
	});

	const numberFmt = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });
	function fmt(n: number): string {
		return numberFmt.format(n);
	}

	// coefficient は「1日あたり」の変化量。選択中の集計粒度に合わせた変化量に換算する（30.44は平均月日数=365.25/12）
	const PERIOD_DAYS: Record<TrendGranularity, number> = { day: 1, week: 7, month: 30.44 };
	const PERIOD_LABEL: Record<TrendGranularity, string> = { day: '日あたりの変化', week: '週あたりの変化', month: '月あたりの変化' };
	const PERIOD_AVG_LABEL: Record<TrendGranularity, string> = { day: '日次', week: '週次', month: '月次' };
	const periodChange = $derived(liveModel ? liveModel.coefficients[0] * PERIOD_DAYS[granularity] : 0);
	const direction = $derived(periodChange > 0 ? 'up' : periodChange < 0 ? 'down' : 'flat');
	const forecastEnd = $derived(liveSeries ? liveSeries.trend[liveSeries.trend.length - 1] : null);
	// 実績と予測の境界（＝現在）に縦線を引く。2点の間ぴったりに置きたいので -0.5 した小数インデックスを使う
	const markerIndex = $derived(liveSeries ? liveSeries.historicalCount - 0.5 : undefined);

	// 右側のAIアシスタントに現在の設定・結果を渡す（妥当性について聞かれた時の材料にもなる）
	$effect(() => {
		bridge.analysisType = 'trend';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			date_column: dateColumn || undefined,
			target_column: targetColumn || undefined,
			horizon_months: Number(horizonMonths),
			granularity
		};
		const m = liveModel;
		bridge.resultSummary = m
			? {
					target_column: m.targetColumn,
					granularity,
					change_per_period: periodChange,
					r2: m.metrics.r2,
					adjusted_r2: m.metrics.adjustedR2,
					sample_size: m.metrics.sampleSize,
					validity: validity ? { overall: validity.overallLevel, comment: validity.overallComment } : undefined
				}
			: null;
	});

	// AIアシスタントの set_config ツールから呼ばれる。dataSourceId を変えると
	// 上の $effect が dateColumn/targetColumn をリセットしてしまうため、
	// リセットが先に走るのを tick() で待ってから値をセットする
	async function applyConfig(patch: Record<string, unknown>) {
		if (typeof patch.data_source_id === 'string' && patch.data_source_id !== dataSourceId) {
			dataSourceId = patch.data_source_id;
			await tick();
		}
		if (typeof patch.date_column === 'string') dateColumn = patch.date_column;
		if (typeof patch.target_column === 'string') targetColumn = patch.target_column;
		if (typeof patch.horizon_months === 'number') horizonMonths = String(patch.horizon_months);
		if (patch.granularity === 'day' || patch.granularity === 'week' || patch.granularity === 'month') {
			granularityValue = patch.granularity;
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
			const res = await fetch(`/api/data-sources/${dataSourceId}/rows?limit=1000`);
			const body = (await res.json()) as { rows?: Record<string, unknown>[]; total?: number; error?: string };
			if (!res.ok) throw new Error(body.error ?? 'データの取得に失敗しました');

			const fetched = body.rows ?? [];
			const cleaned = fetched
				.map((r) => ({ date: String(r[dateColumn] ?? ''), value: Number(r[targetColumn]) }))
				.filter((r) => r.date && Number.isFinite(r.value))
				.sort((a, b) => a.date.localeCompare(b.date));

			if (cleaned.length === 0) throw new Error('日付・数値がどちらも入っている行が見つかりませんでした');

			truncated = (body.total ?? fetched.length) > fetched.length;
			rows = cleaned;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			rows = [];
		} finally {
			loading = false;
		}
	}
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">トレンド予測</h1>
		<p class="page-sub">実績データから将来の推移を線で予測します（日次・週次・月次で集計粒度を切り替えられます）</p>
	</div>

	<section class="config-panel">
		<p class="config-title">設定</p>
		<div class="config-row">
			<Select label="データソース" bind:value={dataSourceId} options={sourceOptions} />
			<Select label="日付列" bind:value={dateColumn} options={dateOptions} disabled={!dataSourceId} />
			<Select label="目的変数" bind:value={targetColumn} options={targetOptions} disabled={!dataSourceId} />
		</div>

		<div class="config-row">
			<Select label="集計粒度" bind:value={granularityValue} options={GRANULARITY_OPTIONS} />
			<Select label="予測期間" bind:value={horizonMonths} options={HORIZON_OPTIONS} />
		</div>

		<Textbox label="分析メモ（任意）" bind:value={note} placeholder="例: 今後1年の会員数推移を見たい" />

		<div class="run-row">
			<button class="run-btn" onclick={run} disabled={!canRun || loading}>
				{loading ? '予測中…' : '予測を実行'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>

	<section class="results-panel">
		{#if liveModel && liveSeries}
			<div class="results-card">
				<div class="metrics-row">
					<div class="metric">
						<span class="metric-label">{PERIOD_LABEL[granularity]}</span>
						<span class="metric-value" class:up={direction === 'up'} class:down={direction === 'down'}>
							{periodChange >= 0 ? '+' : ''}{fmt(periodChange)}
						</span>
					</div>
					<div class="metric">
						<span class="metric-label">決定係数 R²</span>
						<span class="metric-value">{fmt(liveModel.metrics.r2)}</span>
					</div>
					<div class="metric">
						<span class="metric-label">サンプル数</span>
						<span class="metric-value">{liveModel.metrics.sampleSize}件</span>
					</div>
					{#if forecastEnd}
						<div class="metric">
							<span class="metric-label">{forecastEnd.label} 時点の予測値</span>
							<span class="metric-value highlight">{fmt(forecastEnd.value)}</span>
						</div>
					{/if}
				</div>

				<LineChart
					height={180}
					{markerIndex}
					markerLabel="現在"
					series={[
						{ name: `実績（${PERIOD_AVG_LABEL[granularity]}平均）`, data: liveSeries.historical },
						{ name: 'トレンド予測', data: liveSeries.trend }
					]}
				/>

				{#if validity}
					<ValidityCard {validity} />
				{/if}
			</div>
		{:else}
			<div class="empty-results">
				<p>上の設定欄でデータソース・日付列・目的変数を選び、「予測を実行」を押してください</p>
			</div>
		{/if}
	</section>

	{#if rows.length > 0}
		<section class="grid-panel">
			<p class="config-title">元データ（数値を編集すると即グラフに反映されます）</p>
			{#if truncated}
				<p class="hint">データ件数が多いため、先頭{rows.length}件のみ表示・分析しています</p>
			{/if}
			<DataGrid columns={gridColumns} bind:rows maxHeight={320} />
		</section>
	{/if}
</div>

<style lang="scss">
	.module-page {
		padding: 24px 32px 40px;
	}

	.page-header { margin-bottom: 20px; }
	.page-title { font-size: 1.125rem; font-weight: 600; color: var(--color-text); margin: 0 0 4px; }
	.page-sub { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0; }

	.results-panel { margin: 24px 0; }

	.grid-panel {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 24px;
	}

	.hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.empty-results {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 320px;
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

	.metrics-row {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
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

		&.up { color: var(--color-success); }
		&.down { color: var(--color-error); }
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
		gap: 24px;
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
