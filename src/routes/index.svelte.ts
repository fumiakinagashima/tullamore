import Layers from '$lib/components/icon/Layers.svelte';
import Flag from '$lib/components/icon/Flag.svelte';
import Sigma from '$lib/components/icon/Sigma.svelte';
import Grid from '$lib/components/icon/Grid.svelte';
import Flask from '$lib/components/icon/Flask.svelte';
import Scatter from '$lib/components/icon/Scatter.svelte';
import Split from '$lib/components/icon/Split.svelte';
import Tornado from '$lib/components/icon/Tornado.svelte';
import Compare from '$lib/components/icon/Compare.svelte';
import Target from '$lib/components/icon/Target.svelte';
import TrendingUp from '$lib/components/icon/TrendingUp.svelte';
import Dice from '$lib/components/icon/Dice.svelte';
import Coins from '$lib/components/icon/Coins.svelte';
import Database from '$lib/components/icon/Database.svelte';
import Plug from '$lib/components/icon/Plug.svelte';

export const dashboard =  [
	{
		key: 'works',
		label : 'Operations',
		items: [
			{ title: 'Report Creation', desc: 'Run methods you select from correlation analysis, regression analysis, descriptive statistics, classification, and A/B testing, and create a report based on the results.', href: '/report-create', icon: Layers },
			{ title: 'KPI Management', desc: 'From the target value of the outcome variable, back-calculate target values for KPI candidates (explanatory variables) that stay within their observed ranges, and manage them as KPI plans.', href: '/kpi', icon: Flag },
		]
	},
	{
		key: 'analysis',
		label : 'Analysis',
		items: [
			{ title: 'Descriptive Statistics', desc: 'View the mean, median, standard deviation, quartiles, and histogram of a selected column. Use this when you first want to understand the distribution of your data or spot outliers.', href: '/analysis/descriptive-stats', icon: Sigma },
			{ title: 'Correlation Analysis', desc: 'View the Pearson correlation coefficients between selected columns as a heatmap. Use this to explore which variables seem related to each other before running a regression analysis.', href: '/analysis/correlation', icon: Grid },
			{ title: 'A/B Test & Significance Test', desc: 'Test whether there is a statistically significant difference in a metric between two groups (t-test for means, z-test for proportions). Use this to check whether treatment A or treatment B performs better.', href: '/analysis/ab-test', icon: Flask },
			{ title: 'Regression Analysis', desc: 'Simulate how the outcome variable changes when you move the explanatory variables. Use this when you want to examine the impact of drivers, such as how sales change when you increase ad spend.', href: '/analysis/regression', icon: Scatter },
			{ title: 'Logistic Regression & Classification', desc: 'When the outcome variable is binary (e.g. purchased or not), build a model that predicts that probability from explanatory variables. Use this when you want to know what kind of customers are likely to purchase or churn.', href: '/analysis/classification', icon: Split },
			{ title: 'Sensitivity Analysis', desc: 'See how much the outcome variable swings when each explanatory variable is moved across its full observed range, shown as a tornado chart. Use this when you first want to identify which variable has the biggest effect.', href: '/analysis/sensitivity', icon: Tornado },
			{ title: 'Scenario Comparison', desc: 'Prepare multiple combinations of explanatory variables and compare the predicted outcome values side by side. Use this when you want to see how much difference there is between an optimistic case and a pessimistic case.', href: '/analysis/scenario', icon: Compare },
			{ title: 'Goal Seek', desc: 'Back-calculate what the explanatory variables need to be in order for the outcome variable to hit a target value. Use this when you want to know how much ad spend is needed to hit a sales target.', href: '/analysis/goal-seek', icon: Target },
			{ title: 'Trend Forecasting', desc: 'Forecast future movement from time-series data as a line. Use this when you want to see how a value trends over time, such as expectations for 6 months, 1 year, or 5 years out.', href: '/analysis/trend', icon: TrendingUp },
			{ title: 'Monte Carlo Simulation', desc: 'Give explanatory variables a spread (distribution), sample from them many times, and see the resulting variation in possible outcome values. Use this when you want to factor in uncertainty, such as the probability of exceeding a target.', href: '/analysis/monte-carlo', icon: Dice },
			{ title: 'Budget Allocation Optimization', desc: 'Treat explanatory variables as channels (e.g. ad spend) to allocate a budget across, and distribute the total budget to maximize the outcome variable. Use this when you want to know how to split a limited budget across channels.', href: '/analysis/budget-allocation', icon: Coins },
		]
	},
	{
		key: 'data-source',
		label : 'Data Sources',
		items: [
			{ title: 'Database Management', desc: 'Manage table information and data for databases you created or imported from external sources.', href: '/database', icon: Database },
			{ title: 'Data Connections', desc: 'Manage connections to external databases and database services.', href: '/connections', icon: Plug },
		]
	}
];
