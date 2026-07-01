<script lang="ts">
	import BarChart from '$lib/components/ui/BarChart.svelte';
	import LineChart from '$lib/components/ui/LineChart.svelte';
	import PieChart from '$lib/components/ui/PieChart.svelte';
	import ScatterChart from '$lib/components/ui/ScatterChart.svelte';
	import type { ChartContent } from '$lib/types/chat';

	type Props = Omit<ChartContent, 'type'>;

	let { chartType, title, data, series, mode, points, pointSeries, xLabel, yLabel }: Props = $props();
</script>

<div class="chart-wrap">
	{#if chartType === 'bar'}
		<BarChart {data} {series} {title} {mode} />
	{:else if chartType === 'line'}
		<LineChart {data} {series} {title} />
	{:else if chartType === 'scatter'}
		<ScatterChart {points} series={pointSeries} {title} {xLabel} {yLabel} />
	{:else}
		<PieChart data={data ?? []} {title} />
	{/if}
</div>

<style lang="scss">
	.chart-wrap {
		width: 100%;
	}
</style>
