<script lang="ts">
	import Scatter from '$lib/components/icon/Scatter.svelte';
	import TrendingUp from '$lib/components/icon/TrendingUp.svelte';
	import Tornado from '$lib/components/icon/Tornado.svelte';
	import Compare from '$lib/components/icon/Compare.svelte';
	import Target from '$lib/components/icon/Target.svelte';
	import Dice from '$lib/components/icon/Dice.svelte';
	import Coins from '$lib/components/icon/Coins.svelte';
	import Grid from '$lib/components/icon/Grid.svelte';
	import Sigma from '$lib/components/icon/Sigma.svelte';
	import Flask from '$lib/components/icon/Flask.svelte';
	import Split from '$lib/components/icon/Split.svelte';

	const modules = [
		{
			href: '/analysis/descriptive-stats',
			label: 'Descriptive Statistics',
			desc: 'View the mean, median, standard deviation, quartiles, and histogram of a selected column. Use this to first understand the distribution of your data and spot outliers.',
			icon: Sigma
		},
		{
			href: '/analysis/correlation',
			label: 'Correlation Analysis',
			desc: 'View the Pearson correlation coefficients between selected columns as a heatmap. Use this to explore "which variables seem related to which" before running a regression analysis.',
			icon: Grid
		},
		{
			href: '/analysis/ab-test',
			label: 'A/B Test & Significance Testing',
			desc: 'Test whether there is a statistically significant difference in a metric between two groups (t-test for means, z-test for proportions). Use this to check "which is better, treatment A or treatment B."',
			icon: Flask
		},
		{
			href: '/analysis/regression',
			label: 'Regression Analysis',
			desc: 'Simulate how the target variable changes as you move the explanatory variables. Use this to investigate the impact of drivers, such as "what happens to sales if we increase ad spend."',
			icon: Scatter
		},
		{
			href: '/analysis/classification',
			label: 'Logistic Regression & Classification',
			desc: 'Build a model that predicts a probability from explanatory variables when the target variable is binary (e.g. purchased / did not purchase). Use this to find out "which customers are likely to buy or churn."',
			icon: Split
		},
		{
			href: '/analysis/sensitivity',
			label: 'Sensitivity Analysis',
			desc: 'See how much the target variable swings when each explanatory variable is moved across its full observed range, shown as a tornado chart. Use this to first identify which variable has the biggest effect.',
			icon: Tornado
		},
		{
			href: '/analysis/scenario',
			label: 'Scenario Comparison',
			desc: 'Prepare several combinations of explanatory variables and compare the predicted target variable side by side. Use this to see how much difference there is between an optimistic case and a pessimistic case.',
			icon: Compare
		},
		{
			href: '/analysis/goal-seek',
			label: 'Goal Seek',
			desc: 'Work backward to find what the explanatory variables need to be in order to hit a target value for the target variable. Use this to find out, for example, "how much ad spend is needed to hit a sales target."',
			icon: Target
		},
		{
			href: '/analysis/trend',
			label: 'Trend Forecasting',
			desc: 'Project a future trend line from time-series data. Use this to see a trajectory over time, such as "the outlook in six months, one year, or five years."',
			icon: TrendingUp
		},
		{
			href: '/analysis/monte-carlo',
			label: 'Monte Carlo Simulation',
			desc: 'Give explanatory variables a range (distribution), sample a large number of times, and see the spread of possible values for the target variable. Use this to factor in uncertainty, such as "what is the probability of exceeding the target."',
			icon: Dice
		},
		{
			href: '/analysis/budget-allocation',
			label: 'Budget Allocation Optimization',
			desc: 'Treat explanatory variables as channels to allocate a budget to (e.g. ad spend) and distribute the total budget to maximize the target variable. Use this to find out how much of a limited budget should go to each channel.',
			icon: Coins
		}
	];
</script>

<div class="page">
	<div class="page-header">
		<h1 class="page-title">Analysis</h1>
		<p class="page-sub">Select an analysis method based on your goal</p>
	</div>

	<div class="module-cards">
		{#each modules as mod (mod.href)}
			<a href={mod.href} class="module-card">
				<div class="module-card-icon"><mod.icon size={20} /></div>
				<p class="module-card-title">{mod.label}</p>
				<p class="module-card-desc">{mod.desc}</p>
			</a>
		{/each}
	</div>
</div>

<style lang="scss">
	.page {
		padding: 24px 32px;
	}

	.page-header {
		margin-bottom: 20px;
	}

	.page-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 4px;
	}

	.page-sub {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.module-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 14px;
		max-width: 760px;
	}

	.module-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 18px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		text-decoration: none;
		transition: border-color 0.15s, box-shadow 0.15s;

		&:hover {
			border-color: var(--color-primary);
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
		}
	}

	.module-card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-primary) 12%, transparent);
		color: var(--color-primary);
	}

	.module-card-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.module-card-desc {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		line-height: 1.6;
		margin: 0;
	}
</style>
