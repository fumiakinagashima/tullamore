<script lang="ts">
	import { getContext, tick } from 'svelte';
	import type { PageData } from './$types';
	import type { TTestResult, ProportionTestResult } from '$lib/analysis/ab-test';
	import { continuousColumns } from '$lib/analysis/column-type';
	import { ANALYSIS_BRIDGE_KEY, type AnalysisBridge } from '$lib/analysis/assistant-bridge.svelte';
	import { AB_TEST_SIGNIFICANCE_ALPHA } from '$lib/constants';
	import Select from '$lib/components/ui/Select.svelte';

	let { data }: { data: PageData } = $props();

	const bridge = getContext<AnalysisBridge>(ANALYSIS_BRIDGE_KEY);

	const TEST_TYPE_OPTIONS = [
		{ value: 'mean', label: '平均の差を検定（t検定・連続値の指標）' },
		{ value: 'proportion', label: '比率の差を検定（z検定・0/1の指標）' }
	];

	let dataSourceId = $state('');
	let groupColumn = $state('');
	let metricColumn = $state('');
	let testType = $state<'mean' | 'proportion'>('mean');
	let loading = $state(false);
	let error = $state('');
	let result = $state<TTestResult | ProportionTestResult | null>(null);

	const selectedSource = $derived(data.sources.find((s) => s.id === dataSourceId));
	const allColumns = $derived(selectedSource?.columns ?? []);
	const groupOptions = $derived(allColumns.filter((c) => c.key !== metricColumn).map((c) => ({ value: c.key, label: c.label })));
	const numericColumns = $derived(selectedSource ? continuousColumns(selectedSource.columns) : []);
	const metricOptions = $derived(numericColumns.filter((c) => c.key !== groupColumn).map((c) => ({ value: c.key, label: c.label })));
	const sourceOptions = $derived(data.sources.map((s) => ({ value: s.id, label: s.name })));

	$effect(() => {
		dataSourceId;
		groupColumn = '';
		metricColumn = '';
		result = null;
		error = '';
	});

	const canRun = $derived(!!dataSourceId && !!groupColumn && !!metricColumn);

	$effect(() => {
		bridge.analysisType = 'ab-test';
		bridge.config = {
			data_source_id: dataSourceId || undefined,
			group_column: groupColumn || undefined,
			target_column: metricColumn || undefined,
			test_type: testType
		};
		bridge.resultSummary = result
			? {
					test_type: result.kind,
					p_value: result.pValue,
					significant: result.significant,
					...(result.kind === 'mean'
						? { group_a: result.groupA, group_b: result.groupB, mean_diff: result.meanDiff }
						: { group_a: result.groupA, group_b: result.groupB, diff: result.diff })
				}
			: null;
	});

	async function applyConfig(patch: Record<string, unknown>) {
		if (typeof patch.data_source_id === 'string' && patch.data_source_id !== dataSourceId) {
			dataSourceId = patch.data_source_id;
			await tick();
		}
		if (typeof patch.group_column === 'string') groupColumn = patch.group_column;
		if (typeof patch.target_column === 'string') metricColumn = patch.target_column;
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

	async function run() {
		if (!canRun) return;
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/analysis/ab-test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataSourceId, groupColumn, metricColumn, testType })
			});
			const body = (await res.json()) as { result?: TTestResult | ProportionTestResult; error?: string };
			if (!res.ok) throw new Error(body.error ?? '検定に失敗しました');
			result = body.result ?? null;
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
</script>

<div class="module-page">
	<div class="page-header">
		<h1 class="page-title">A/Bテスト・有意差検定</h1>
		<p class="page-sub">2つのグループ間で指標に統計的に有意な差があるかを検定します（平均はWelchのt検定、比率はz検定）</p>
	</div>

	<section class="results-panel">
		{#if result}
			<div class="results-card">
				<p class="verdict" class:significant={result.significant}>
					{result.significant
						? `統計的に有意な差があります（p = ${fmt(result.pValue)} < ${AB_TEST_SIGNIFICANCE_ALPHA}）`
						: `統計的に有意な差は見られません（p = ${fmt(result.pValue)} ≥ ${AB_TEST_SIGNIFICANCE_ALPHA}）`}
				</p>

				<div class="groups-row">
					<div class="group-card">
						<p class="group-name">{result.groupA.group}</p>
						{#if result.kind === 'mean'}
							<span class="group-metric">平均 {fmt(result.groupA.mean)}（n={result.groupA.n}）</span>
						{:else}
							<span class="group-metric">比率 {fmtPct(result.propA)}（{result.groupA.successes}/{result.groupA.n}）</span>
						{/if}
					</div>
					<div class="group-card">
						<p class="group-name">{result.groupB.group}</p>
						{#if result.kind === 'mean'}
							<span class="group-metric">平均 {fmt(result.groupB.mean)}（n={result.groupB.n}）</span>
						{:else}
							<span class="group-metric">比率 {fmtPct(result.propB)}（{result.groupB.successes}/{result.groupB.n}）</span>
						{/if}
					</div>
				</div>

				<div class="metrics-row">
					<div class="metric">
						<span class="metric-label">差</span>
						<span class="metric-value highlight">
							{result.kind === 'mean' ? fmt(result.meanDiff) : fmtPct(result.diff)}
						</span>
					</div>
					<div class="metric">
						<span class="metric-label">{result.kind === 'mean' ? 't統計量' : 'z統計量'}</span>
						<span class="metric-value">{fmt(result.kind === 'mean' ? result.tStat : result.zStat)}</span>
					</div>
					{#if result.kind === 'mean'}
						<div class="metric">
							<span class="metric-label">自由度</span>
							<span class="metric-value">{fmt(result.df)}</span>
						</div>
					{/if}
					<div class="metric">
						<span class="metric-label">p値</span>
						<span class="metric-value">{fmt(result.pValue)}</span>
					</div>
					<div class="metric">
						<span class="metric-label">95%信頼区間</span>
						<span class="metric-value">
							{result.kind === 'mean' ? `${fmt(result.ci95[0])} 〜 ${fmt(result.ci95[1])}` : `${fmtPct(result.ci95[0])} 〜 ${fmtPct(result.ci95[1])}`}
						</span>
					</div>
				</div>
			</div>
		{:else}
			<div class="empty-results">
				<p>下の設定欄でデータソース・グループ列（2値）・指標列・検定方法を選び、「検定を実行」を押してください</p>
			</div>
		{/if}
	</section>

	<section class="config-panel">
		<p class="config-title">設定</p>
		<div class="config-row">
			<Select label="データソース" bind:value={dataSourceId} options={sourceOptions} />
			<Select label="グループ列（値が2種類である列）" bind:value={groupColumn} options={groupOptions} disabled={!dataSourceId} />
		</div>
		<div class="config-row">
			<Select label="指標列（数値）" bind:value={metricColumn} options={metricOptions} disabled={!dataSourceId} />
			<Select label="検定方法" bind:value={testType} options={TEST_TYPE_OPTIONS} />
		</div>
		{#if testType === 'proportion'}
			<p class="hint">比率のz検定を選ぶ場合、指標列の値は0または1である必要があります（例: コンバージョンの有無）</p>
		{/if}

		<div class="run-row">
			<button class="run-btn" onclick={run} disabled={!canRun || loading}>
				{loading ? '検定中…' : '検定を実行'}
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

	.verdict {
		margin: 0;
		padding: 10px 14px;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-muted);
		background: var(--color-neutral-bg);

		&.significant {
			color: var(--color-info);
			background: var(--color-info-bg);
		}
	}

	.groups-row {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}

	.group-card {
		flex: 1;
		min-width: 200px;
		padding: 12px 14px;
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 8px;
	}

	.group-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 4px;
	}

	.group-metric {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
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

	.hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0;
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
