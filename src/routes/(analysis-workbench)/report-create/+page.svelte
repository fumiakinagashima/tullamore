<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import type { LinearRegressionModel } from '$lib/analysis/types';
	import type { LogisticRegressionModel } from '$lib/analysis/methods/logistic-regression';
	import type { TTestResult, ProportionTestResult } from '$lib/analysis/ab-test';
	import type { ValidityAssessment } from '$lib/analysis/validity';
	import type { CorrelationMatrix } from '$lib/analysis/correlation-matrix';
	import type { DescriptiveStatsSummary } from '$lib/analysis/descriptive-stats';
	import { continuousColumns, inferAnalysisColumnType } from '$lib/analysis/column-type';
	import { AB_TEST_SIGNIFICANCE_ALPHA } from '$lib/constants';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import ValidityCard from '$lib/components/ui/ValidityCard.svelte';
	import CorrelationHeatmap from '$lib/components/ui/CorrelationHeatmap.svelte';
	import ReportModal from '$lib/components/analysis/ReportModal.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	type MethodKey = 'correlation' | 'regression' | 'descriptive-stats' | 'classification' | 'ab-test';

	const METHOD_OPTIONS: { key: MethodKey; label: string }[] = [
		{ key: 'correlation', label: '相関分析' },
		{ key: 'regression', label: '回帰分析' },
		{ key: 'descriptive-stats', label: '記述統計' },
		{ key: 'classification', label: 'ロジスティック回帰（分類）' },
		{ key: 'ab-test', label: 'A/Bテスト・有意差検定' }
	];

	const TEST_TYPE_OPTIONS = [
		{ value: 'mean', label: '平均の差を検定（t検定・連続値の指標）' },
		{ value: 'proportion', label: '比率の差を検定（z検定・0/1の指標）' }
	];

	let dataSourceId = $state('');
	let methods = $state<Set<MethodKey>>(new Set());

	// 相関分析・回帰分析・記述統計は同じ「目的変数+説明変数」の設定形状を共有する
	let targetColumn = $state('');
	let featureColumns = $state<string[]>([]);

	// ロジスティック回帰は目的変数が2値である必要があるため、独立した変数として扱う
	let classifTargetColumn = $state('');
	let classifFeatureColumns = $state<string[]>([]);

	// A/Bテストはグループ列・指標列という別形状の設定を持つ
	let groupColumn = $state('');
	let metricColumn = $state('');
	let testType = $state<'mean' | 'proportion'>('mean');

	let loading = $state(false);
	let error = $state('');

	type AnalysisEntry = { analysisType: string; label: string; config: Record<string, unknown>; resultSummary: Record<string, unknown> };
	type ResultCard = { key: MethodKey; entry: AnalysisEntry } & (
		| { key: 'correlation'; matrix: CorrelationMatrix; validity: ValidityAssessment }
		| { key: 'regression'; model: LinearRegressionModel; validity: ValidityAssessment }
		| { key: 'descriptive-stats'; stats: DescriptiveStatsSummary }
		| { key: 'classification'; model: LogisticRegressionModel; validity: ValidityAssessment }
		| { key: 'ab-test'; result: TTestResult | ProportionTestResult; validity: ValidityAssessment }
	);

	let resultCards = $state<ResultCard[]>([]);
	let skippedMethods = $state<MethodKey[]>([]);
	let failedMethods = $state<{ key: MethodKey; message: string }[]>([]);

	let reportModalOpen = $state(false);
	let reportLoading = $state(false);
	let report = $state<string | null>(null);
	let reportError = $state<string | null>(null);

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	const numericColumns = $derived(selectedSource ? continuousColumns(selectedSource.columns) : []);
	const targetOptions = $derived(numericColumns.map((c) => ({ value: c.key, label: c.label })));
	const featureCandidates = $derived(numericColumns.filter((c) => c.key !== targetColumn));
	const sourceOptions = $derived(data.sources.map((s) => ({ value: s.id, label: s.name })));

	// 分類の目的変数は2値であれば数値・カテゴリどちらの列でもよい（id/date列は除外）。classification/+page.svelte と同じ判定
	const classifTargetCandidates = $derived(
		selectedSource?.columns.filter((c) => {
			const t = inferAnalysisColumnType(c);
			return t !== 'id' && t !== 'date';
		}) ?? []
	);
	const classifTargetOptions = $derived(classifTargetCandidates.map((c) => ({ value: c.key, label: c.label })));
	const classifFeatureCandidates = $derived(numericColumns.filter((c) => c.key !== classifTargetColumn));

	const groupOptions = $derived((selectedSource?.columns ?? []).filter((c) => c.key !== metricColumn).map((c) => ({ value: c.key, label: c.label })));
	const metricOptions = $derived(numericColumns.filter((c) => c.key !== groupColumn).map((c) => ({ value: c.key, label: c.label })));

	function labelOf(key: string): string {
		return selectedSource?.columns.find((c) => c.key === key)?.label ?? key;
	}

	function resetResults() {
		resultCards = [];
		skippedMethods = [];
		failedMethods = [];
	}

	$effect(() => {
		dataSourceId;
		targetColumn = '';
		featureColumns = [];
		classifTargetColumn = '';
		classifFeatureColumns = [];
		groupColumn = '';
		metricColumn = '';
		resetResults();
		error = '';
	});

	function toggleMethod(key: MethodKey, checked: boolean) {
		const next = new Set(methods);
		if (checked) next.add(key);
		else next.delete(key);
		methods = next;
	}

	function toggleFeature(key: string, checked: boolean) {
		featureColumns = checked ? [...featureColumns, key] : featureColumns.filter((k) => k !== key);
	}

	function toggleClassifFeature(key: string, checked: boolean) {
		classifFeatureColumns = checked ? [...classifFeatureColumns, key] : classifFeatureColumns.filter((k) => k !== key);
	}

	const needsTargetFeatureGroup = $derived(methods.has('correlation') || methods.has('regression') || methods.has('descriptive-stats'));
	const needsClassification = $derived(methods.has('classification'));
	const needsAbTest = $derived(methods.has('ab-test'));

	const canRun = $derived(!!dataSourceId && methods.size > 0);

	// このページの「レポートを作成」はAIアシスタント欄の汎用ボタンではなく画面上の専用ボタンを使う
	// （選択手法の組み合わせを都度束ねるため resultSummary は単一分析用のレポート生成に流用しない。null のままにしてボタンを非表示にする）
	$effect(() => {
		bridge.analysisType = 'report-create';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			methods: methods.size > 0 ? Array.from(methods) : undefined,
			target_column: targetColumn || undefined,
			feature_columns: featureColumns.length > 0 ? featureColumns : undefined,
			group_column: groupColumn || undefined,
			test_type: needsAbTest ? testType : undefined
		};
		bridge.resultSummary = null;
	});

	async function applyConfig(patch: Record<string, unknown>) {
		if (typeof patch.data_source_id === 'string' && patch.data_source_id !== dataSourceId) {
			dataSourceId = patch.data_source_id;
			await tick();
		}
		if (Array.isArray(patch.methods)) {
			const valid = new Set(METHOD_OPTIONS.map((m) => m.key));
			methods = new Set(patch.methods.filter((m): m is MethodKey => typeof m === 'string' && valid.has(m as MethodKey)));
		}
		if (typeof patch.target_column === 'string') targetColumn = patch.target_column;
		if (Array.isArray(patch.feature_columns)) {
			featureColumns = patch.feature_columns.filter((c): c is string => typeof c === 'string');
		}
		if (typeof patch.group_column === 'string') groupColumn = patch.group_column;
		if (patch.test_type === 'mean' || patch.test_type === 'proportion') testType = patch.test_type;
		await tick();
		if (canRun) await run();
	}

	$effect(() => {
		bridge.applyConfig = applyConfig;
		return () => {
			if (bridge.applyConfig === applyConfig) bridge.applyConfig = null;
		};
	});

	async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
		const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		const json = (await res.json()) as Record<string, unknown>;
		if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'リクエストに失敗しました');
		return json;
	}

	async function run() {
		if (!canRun) return;
		loading = true;
		error = '';
		resetResults();

		const cards: ResultCard[] = [];
		const skipped: MethodKey[] = [];
		const failed: { key: MethodKey; message: string }[] = [];

		const jobs: { key: MethodKey; run: () => Promise<void> }[] = [];

		if (methods.has('correlation')) {
			if (!targetColumn || featureColumns.length === 0) skipped.push('correlation');
			else
				jobs.push({
					key: 'correlation',
					run: async () => {
						const body = await postJson('/api/analysis/correlation', { dataSourceId, columns: [targetColumn, ...featureColumns] });
						const matrix = body.matrix as CorrelationMatrix;
						const validity = body.validity as ValidityAssessment;
						const strongest = strongestPairOf(matrix);
						cards.push({
							key: 'correlation',
							matrix,
							validity,
							entry: {
								analysisType: 'correlation',
								label: '相関分析',
								config: { data_source_id: dataSourceId, feature_columns: [targetColumn, ...featureColumns] },
								resultSummary: {
									columns: matrix.columns,
									sample_size: matrix.sampleSize,
									strongest_pair: strongest ? { a: labelOf(strongest.a), b: labelOf(strongest.b), correlation: strongest.value } : null,
									validity: { overall: validity.overallLevel, comment: validity.overallComment }
								}
							}
						});
					}
				});
		}

		if (methods.has('regression')) {
			if (!targetColumn || featureColumns.length === 0) skipped.push('regression');
			else
				jobs.push({
					key: 'regression',
					run: async () => {
						const body = await postJson('/api/analysis/regression', { dataSourceId, targetColumn, featureColumns });
						const model = body.model as LinearRegressionModel;
						const validity = body.validity as ValidityAssessment;
						cards.push({
							key: 'regression',
							model,
							validity,
							entry: {
								analysisType: 'regression',
								label: '回帰分析',
								config: { data_source_id: dataSourceId, target_column: targetColumn, feature_columns: featureColumns },
								resultSummary: {
									r2: model.metrics.r2,
									adjusted_r2: model.metrics.adjustedR2,
									sample_size: model.metrics.sampleSize,
									coefficients: Object.fromEntries(model.featureColumns.map((c, i) => [c, model.coefficients[i]])),
									validity: { overall: validity.overallLevel, comment: validity.overallComment }
								}
							}
						});
					}
				});
		}

		if (methods.has('descriptive-stats')) {
			if (!targetColumn) skipped.push('descriptive-stats');
			else
				jobs.push({
					key: 'descriptive-stats',
					run: async () => {
						const body = await postJson('/api/analysis/descriptive-stats', { dataSourceId, columns: [targetColumn] });
						const stats = (body.stats as Record<string, DescriptiveStatsSummary>)[targetColumn];
						cards.push({
							key: 'descriptive-stats',
							stats,
							entry: {
								analysisType: 'descriptive-stats',
								label: '記述統計',
								config: { data_source_id: dataSourceId, feature_columns: [targetColumn] },
								resultSummary: {
									target_column: targetColumn,
									n: stats.n,
									mean: stats.mean,
									median: stats.median,
									stddev: stats.stddev,
									outlier_count: stats.outlierCount,
									validity: { overall: stats.validity.overallLevel, comment: stats.validity.overallComment }
								}
							}
						});
					}
				});
		}

		if (methods.has('classification')) {
			if (!classifTargetColumn || classifFeatureColumns.length === 0) skipped.push('classification');
			else
				jobs.push({
					key: 'classification',
					run: async () => {
						const body = await postJson('/api/analysis/classification', {
							dataSourceId,
							targetColumn: classifTargetColumn,
							featureColumns: classifFeatureColumns
						});
						const model = body.model as LogisticRegressionModel;
						const validity = body.validity as ValidityAssessment;
						cards.push({
							key: 'classification',
							model,
							validity,
							entry: {
								analysisType: 'classification',
								label: 'ロジスティック回帰・分類',
								config: { data_source_id: dataSourceId, target_column: classifTargetColumn, feature_columns: classifFeatureColumns },
								resultSummary: {
									positive_class: model.positiveClassLabel,
									accuracy: model.metrics.accuracy,
									precision: model.metrics.precision,
									recall: model.metrics.recall,
									f1: model.metrics.f1,
									pseudo_r2: model.metrics.pseudoR2,
									validity: { overall: validity.overallLevel, comment: validity.overallComment }
								}
							}
						});
					}
				});
		}

		if (methods.has('ab-test')) {
			if (!groupColumn || !metricColumn) skipped.push('ab-test');
			else
				jobs.push({
					key: 'ab-test',
					run: async () => {
						const body = await postJson('/api/analysis/ab-test', { dataSourceId, groupColumn, metricColumn, testType });
						const result = body.result as TTestResult | ProportionTestResult;
						const validity = body.validity as ValidityAssessment;
						cards.push({
							key: 'ab-test',
							result,
							validity,
							entry: {
								analysisType: 'ab-test',
								label: 'A/Bテスト・有意差検定',
								config: { data_source_id: dataSourceId, group_column: groupColumn, target_column: metricColumn, test_type: testType },
								resultSummary: {
									test_type: result.kind,
									p_value: result.pValue,
									significant: result.significant,
									...(result.kind === 'mean'
										? { group_a: result.groupA, group_b: result.groupB, mean_diff: result.meanDiff }
										: { group_a: result.groupA, group_b: result.groupB, diff: result.diff }),
									validity: { overall: validity.overallLevel, comment: validity.overallComment }
								}
							}
						});
					}
				});
		}

		const settled = await Promise.allSettled(jobs.map((j) => j.run()));
		settled.forEach((s, i) => {
			if (s.status === 'rejected') {
				failed.push({ key: jobs[i].key, message: s.reason instanceof Error ? s.reason.message : String(s.reason) });
			}
		});

		// カードは METHOD_OPTIONS の並び順に揃える（Promise.allSettled の完了順ではなく）
		const order = METHOD_OPTIONS.map((m) => m.key);
		cards.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

		resultCards = cards;
		skippedMethods = skipped;
		failedMethods = failed;
		loading = false;
	}

	function strongestPairOf(matrix: CorrelationMatrix): { a: string; b: string; value: number } | null {
		let best: { a: string; b: string; value: number } | null = null;
		for (let i = 0; i < matrix.columns.length; i++) {
			for (let j = i + 1; j < matrix.columns.length; j++) {
				const value = matrix.matrix[i][j];
				if (!best || Math.abs(value) > Math.abs(best.value)) {
					best = { a: matrix.columns[i], b: matrix.columns[j], value };
				}
			}
		}
		return best;
	}

	function heatmapColumnsOf(matrix: CorrelationMatrix) {
		return matrix.columns.map((key) => ({ key, label: labelOf(key) }));
	}

	async function createReport() {
		if (resultCards.length === 0) return;
		reportModalOpen = true;
		reportLoading = true;
		report = null;
		reportError = null;
		try {
			const analyses = resultCards.map(({ entry }) => ({
				analysisType: entry.analysisType,
				config: entry.config,
				resultSummary: entry.resultSummary
			}));
			const body = await postJson('/api/analysis/report-create', { analyses });
			report = (body.report as string) ?? null;
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
	function fmtPct(n: number): string {
		return `${(n * 100).toFixed(1)}%`;
	}

	const METHOD_LABEL: Record<MethodKey, string> = Object.fromEntries(METHOD_OPTIONS.map((m) => [m.key, m.label])) as Record<MethodKey, string>;
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">レポート作成</h1>
		<p class="page-sub">選んだ分析手法を同じデータソースに対して実行し、結果を踏まえたレポートを作成します（1手法だけでも、複数を組み合わせても使えます）</p>
	</div>

	<section class="results-panel">
		{#if resultCards.length > 0}
			<div class="analysis-grid">
				{#each resultCards as card (card.key)}
					<div class="analysis-card">
						<p class="analysis-title">{METHOD_LABEL[card.key]}</p>
						{#if card.key === 'correlation'}
							<ValidityCard validity={card.validity} />
							{#if strongestPairOf(card.matrix)}
								{@const pair = strongestPairOf(card.matrix)}
								{#if pair}
									<p class="mini-note">最も相関が強いのは「{labelOf(pair.a)}」と「{labelOf(pair.b)}」（r = {fmt(pair.value)}）</p>
								{/if}
							{/if}
							<CorrelationHeatmap columns={heatmapColumnsOf(card.matrix)} matrix={card.matrix.matrix} />
						{:else if card.key === 'regression'}
							<ValidityCard validity={card.validity} />
							<div class="metrics-row">
								<div class="metric"><span class="metric-label">R²</span><span class="metric-value highlight">{fmt(card.model.metrics.r2)}</span></div>
								<div class="metric"><span class="metric-label">サンプル数</span><span class="metric-value">{card.model.metrics.sampleSize}</span></div>
							</div>
							<ul class="coef-list">
								{#each card.model.featureColumns as key, i (key)}
									<li>{labelOf(key)}: <strong>{fmt(card.model.coefficients[i])}</strong></li>
								{/each}
							</ul>
						{:else if card.key === 'descriptive-stats'}
							<ValidityCard validity={card.stats.validity} />
							<div class="metrics-row">
								<div class="metric"><span class="metric-label">件数</span><span class="metric-value">{card.stats.n.toLocaleString()}</span></div>
								<div class="metric"><span class="metric-label">平均</span><span class="metric-value highlight">{fmt(card.stats.mean)}</span></div>
								<div class="metric"><span class="metric-label">中央値</span><span class="metric-value">{fmt(card.stats.median)}</span></div>
								<div class="metric"><span class="metric-label">標準偏差</span><span class="metric-value">{fmt(card.stats.stddev)}</span></div>
							</div>
						{:else if card.key === 'classification'}
							<ValidityCard validity={card.validity} />
							<p class="mini-note">正例として扱った値: <strong>{card.model.positiveClassLabel}</strong></p>
							<div class="metrics-row">
								<div class="metric"><span class="metric-label">正解率</span><span class="metric-value highlight">{fmtPct(card.model.metrics.accuracy)}</span></div>
								<div class="metric"><span class="metric-label">適合率</span><span class="metric-value">{fmtPct(card.model.metrics.precision)}</span></div>
								<div class="metric"><span class="metric-label">再現率</span><span class="metric-value">{fmtPct(card.model.metrics.recall)}</span></div>
								<div class="metric"><span class="metric-label">疑似R²</span><span class="metric-value">{fmt(card.model.metrics.pseudoR2)}</span></div>
							</div>
						{:else if card.key === 'ab-test'}
							<ValidityCard validity={card.validity} />
							<p class="verdict" class:significant={card.result.significant}>
								{card.result.significant
									? `統計的に有意な差があります（p = ${fmt(card.result.pValue)} < ${AB_TEST_SIGNIFICANCE_ALPHA}）`
									: `統計的に有意な差は見られません（p = ${fmt(card.result.pValue)} ≥ ${AB_TEST_SIGNIFICANCE_ALPHA}）`}
							</p>
							<div class="metrics-row">
								<div class="metric">
									<span class="metric-label">{card.result.groupA.group}</span>
									<span class="metric-value">
										{card.result.kind === 'mean' ? fmt(card.result.groupA.mean) : fmtPct(card.result.propA)}
									</span>
								</div>
								<div class="metric">
									<span class="metric-label">{card.result.groupB.group}</span>
									<span class="metric-value">
										{card.result.kind === 'mean' ? fmt(card.result.groupB.mean) : fmtPct(card.result.propB)}
									</span>
								</div>
								<div class="metric">
									<span class="metric-label">差</span>
									<span class="metric-value highlight">
										{card.result.kind === 'mean' ? fmt(card.result.meanDiff) : fmtPct(card.result.diff)}
									</span>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if skippedMethods.length > 0 || failedMethods.length > 0}
				<div class="notice-list">
					{#each skippedMethods as key (key)}
						<p class="hint">「{METHOD_LABEL[key]}」は必要な列が未設定のためスキップしました</p>
					{/each}
					{#each failedMethods as f (f.key)}
						<p class="error-text">「{METHOD_LABEL[f.key]}」の実行に失敗しました: {f.message}</p>
					{/each}
				</div>
			{/if}

			<div class="report-row">
				<button class="run-btn" onclick={createReport}>レポートを作成</button>
			</div>
		{:else}
			<div class="empty-results">
				<p>下の設定欄でデータソース・分析手法を選び、「分析を実行」を押してください。手法に迷う場合は右のAIアシスタントに相談してください</p>
			</div>
		{/if}
	</section>

	<section class="config-panel">
		<p class="config-title">設定</p>
		<Select label="データソース" bind:value={dataSourceId} options={sourceOptions} />

		<div class="method-picker">
			<span class="field-label">分析手法（複数選択可）</span>
			{#if !dataSourceId}
				<p class="hint">先にデータソースを選択してください</p>
			{:else}
				<div class="checkbox-list">
					{#each METHOD_OPTIONS as opt (opt.key)}
						<label class="checkbox-item">
							<input type="checkbox" checked={methods.has(opt.key)} onchange={(e) => toggleMethod(opt.key, e.currentTarget.checked)} />
							{opt.label}
						</label>
					{/each}
				</div>
			{/if}
		</div>

		{#if needsTargetFeatureGroup}
			<div class="method-config">
				<p class="method-config-title">相関分析・回帰分析・記述統計の設定</p>
				<div class="config-row">
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
									<input type="checkbox" checked={featureColumns.includes(col.key)} onchange={(e) => toggleFeature(col.key, e.currentTarget.checked)} />
									{col.label}
								</label>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if needsClassification}
			<div class="method-config">
				<p class="method-config-title">ロジスティック回帰（分類）の設定</p>
				<div class="config-row">
					<Select label="目的変数（2値）" bind:value={classifTargetColumn} options={classifTargetOptions} disabled={!dataSourceId} />
				</div>
				<div class="feature-picker">
					<span class="field-label">説明変数（複数選択可）</span>
					{#if !classifTargetColumn}
						<p class="hint">先に目的変数を選択してください</p>
					{:else if classifFeatureCandidates.length === 0}
						<p class="hint">選択できる数値列がありません</p>
					{:else}
						<div class="checkbox-list">
							{#each classifFeatureCandidates as col (col.key)}
								<label class="checkbox-item">
									<input
										type="checkbox"
										checked={classifFeatureColumns.includes(col.key)}
										onchange={(e) => toggleClassifFeature(col.key, e.currentTarget.checked)}
									/>
									{col.label}
								</label>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if needsAbTest}
			<div class="method-config">
				<p class="method-config-title">A/Bテストの設定</p>
				<div class="config-row">
					<Select label="グループ列（値が2種類である列）" bind:value={groupColumn} options={groupOptions} disabled={!dataSourceId} />
					<Select label="指標列（数値）" bind:value={metricColumn} options={metricOptions} disabled={!dataSourceId} />
				</div>
				<div class="config-row">
					<Select label="検定方法" bind:value={testType} options={TEST_TYPE_OPTIONS} />
				</div>
				{#if testType === 'proportion'}
					<p class="hint">比率のz検定を選ぶ場合、指標列の値は0または1である必要があります（例: コンバージョンの有無）</p>
				{/if}
			</div>
		{/if}

		<div class="run-row">
			<button class="run-btn" onclick={run} disabled={!canRun || loading}>
				{loading ? '分析中…' : '分析を実行'}
			</button>
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
	</section>
</div>

<ReportModal open={reportModalOpen} loading={reportLoading} {report} error={reportError} onClose={() => (reportModalOpen = false)} />

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

	.verdict {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text-muted);
		margin: 0;

		&.significant { color: var(--color-success); }
	}

	.notice-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
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

	.method-picker, .feature-picker {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.method-config {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px;
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}

	.method-config-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
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
