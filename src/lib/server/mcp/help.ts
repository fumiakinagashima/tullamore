import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';

export const tools: Tool[] = [
	{
		name: 'get_help',
		description:
			'Get usage instructions and feature explanations. Call this when the user asks things like "how do I use this?", "what can this do?", "help", or "how do I use feature X?". Omitting topic returns a general overview.',
		input_schema: {
			type: 'object',
			properties: {
				topic: {
					type: 'string',
					enum: ['overview', 'data_sources', 'analysis', 'simulator', 'report_create', 'kpi', 'email'],
					description: 'The topic to learn about (omit for a general overview)'
				}
			}
		}
	}
];

const getHelpInputSchema = z.object({
	topic: z.enum(['overview', 'data_sources', 'analysis', 'simulator', 'report_create', 'kpi', 'email']).optional()
});

const HELP: Record<string, object> = {
	overview: {
		title: 'TULLAMORE User Guide',
		description:
			'Not a BI (dashboard) tool that looks back at the past, but a DI (Decision Intelligence) tool where AI applies analytical methods to guide you toward "what to do next." ' +
			'In addition to natural-language analysis where you simply ask questions in chat, you can have the AI choose analytical methods and compile a report, or work backward from a goal to derive KPIs.',
		features: [
			{ name: 'Data Source Management', topic: 'data_sources', examples: ['I want to import and register a CSV', 'I want to create a new data source'] },
			{
				name: 'Analysis & Simulation',
				topic: 'analysis',
				examples: ['Show me the sales trend over the past year', 'I want to use regression analysis to examine the relationship between ad spend and sales', 'I want to test whether there is a difference between measure A and measure B']
			},
			{ name: 'Report Creation', topic: 'report_create', examples: ['Analyze sales and its drivers together and turn it into a report'] },
			{ name: 'KPI Setup', topic: 'kpi', examples: ['I want to create KPIs to reach 30 million yen in sales next year', 'Show me the current KPI achievement rate'] },
			{ name: 'Simulator Creation (Chat)', topic: 'simulator', examples: ['Create a simulator that predicts sales from ad spend'] },
			{ name: 'Sending Email', topic: 'email', examples: ['Send the report by email'] }
		],
		tips: [
			'In chat (/chat), asking questions in plain natural language builds SQL and produces aggregations/charts. It is well suited to one-off questions that don\'t fit a fixed analysis menu.',
			'If you want to explicitly use a specific statistical method, use the screens under the "Analysis" section of the sidebar directly. If you are unsure which method to choose, the AI assistant on the right of each analysis screen can set the configuration for you.',
			'You can register and manage data sources from the "Database Management" item in the side menu.'
		],
		relatedPages: [
			{ label: 'Chat', href: '/chat', description: 'Natural-language questions, aggregation, and simulator creation' },
			{ label: 'Report Creation', href: '/report-create', description: 'Choose analytical methods and have the AI create a report' },
			{ label: 'KPI Management', href: '/kpi', description: 'Work backward from a goal to derive KPIs and check achievement rates' },
			{ label: 'Database Management', href: '/database', description: 'Register data and import CSVs' },
			{ label: 'Settings', href: '/settings', description: 'Change various app settings' }
		]
	},
	data_sources: {
		title: 'Data Source Management',
		description: 'Register and manage the data you want to analyze. Supports CSV import, external DB connections, a no-code UI, and direct SQL execution.',
		operations: [
			{ action: 'Create a new data source', examples: ['Enter column definitions from "New" on the "Database Management" page'] },
			{ action: 'Import a CSV', examples: ['Upload from the "CSV Import" section of the data source detail page'] },
			{ action: 'Import from an external DB', examples: ['I want to import tables from Supabase or the app\'s own Postgres/MySQL'] },
			{ action: 'Run SQL directly', examples: ['You can run SELECT statements from "SQL Query" on the "Database Management" page'] },
			{ action: 'Check data quality', examples: ['Does this data have missing values or outliers?'] }
		],
		tips: [
			'The first row of a CSV is read as the header row (make sure it matches the column keys)',
			'Each data source detail page automatically shows the missing-value count, outlier candidates, and validity check for each numeric column',
			'External DB connections are managed from "Connections" (admin only)',
			'The AI refers to the data source name, description, and column labels when performing analysis'
		],
		relatedPages: [
			{ label: 'Database Management', href: '/database', description: 'List, register, import CSVs, and check quality for data sources' },
			{ label: 'Connections', href: '/connections', description: 'Import tables from an external DB (admin only)' }
		]
	},
	analysis: {
		title: 'Analysis & Simulation',
		description:
			'You can get answers by asking natural-language questions in chat, or use a specific statistical method directly and have the AI help configure it. ' +
			'Either way, the goal is to clarify "what can we say from this data" and "how would the outcome change if we moved a variable," and connect that to the next action.',
		operations: [
			{ action: 'Ask in natural language via chat', examples: ['Show me monthly sales over the past year', 'What are the top 10 regions by sales?', 'Show it as a bar chart'] },
			{ action: 'Investigate drivers with driver analysis (regression)', examples: ['I want to find out how much ad spend and store visits contribute to sales'] },
			{ action: 'Test the difference between two groups (A/B test)', examples: ['I want to check whether there is a difference in conversion rate between measure A and measure B'] },
			{ action: 'Predict a binary outcome (logistic regression / classification)', examples: ['I want to predict whether someone will make a purchase based on ad spend and store visits'] },
			{ action: 'Forecast future values (trend forecasting)', examples: ['Forecast sales for next month / next year'] },
			{ action: 'Find influential variables (sensitivity analysis) / work backward (goal seek) / compare (scenario comparison) / view uncertainty (Monte Carlo) / allocate budget (budget allocation optimization)', examples: ['How much should we spend on ads to hit our sales target?'] }
		],
		tips: [
			'From the "Analysis" section of the sidebar you can go directly to screens for descriptive statistics, correlation analysis, regression analysis, logistic regression, A/B testing, sensitivity analysis, scenario comparison, goal seek, trend forecasting, Monte Carlo simulation, and budget allocation optimization',
			'If you are not sure which method to use, tell the AI assistant on the right side of each screen in natural language and it will set the data source, columns, and configuration for you',
			'Results automatically show a validity check (sample size, goodness of fit, etc.) so you can verify the numbers rather than taking them at face value',
			'If you want the AI to compile a report combining multiple methods, use "Report Creation"'
		],
		relatedPages: [
			{ label: 'Analysis', href: '/analysis', description: 'A list of dedicated analysis tools such as descriptive statistics, correlation analysis, and regression analysis' },
			{ label: 'Chat', href: '/chat', description: 'Ask natural-language questions to aggregate and chart data' }
		]
	},
	report_create: {
		title: 'Report Creation',
		description:
			'Choose the methods you want among correlation analysis, regression analysis, descriptive statistics, logistic regression (classification), and A/B testing, run them, ' +
			'and the AI compiles a business-facing report grounded in the results. You can use a single method alone or combine several.',
		operations: [
			{ action: 'Create a report', examples: ['Analyze sales and its drivers together and turn it into a report', 'Turn the correlation and regression of this data into a report'] }
		],
		tips: [
			'If you are unsure which method to choose, consult the AI assistant on the right (tell it in natural language and it will set the method and configuration for you)',
			'When multiple methods are selected, the AI does not produce a single composite score; instead it interprets whether the conclusions agree or conflict across methods, and also notes the risk of multiple comparisons',
			'The report itself is generated from the dedicated button on the screen (the AI assistant only sets up the configuration)'
		],
		relatedPages: [{ label: 'Report Creation', href: '/report-create', description: 'Choose analytical methods and create a report' }]
	},
	kpi: {
		title: 'KPI Setup',
		description:
			'From a target value for the objective variable (e.g. sales), this works backward to derive target values for KPI candidates (explanatory variables) and saves them as a KPI plan. ' +
			'After saving, you can check the achievement rate against current data with a gauge.',
		operations: [
			{ action: 'Set up a KPI', examples: ['I want to create KPIs to reach 30 million yen in sales next year'] },
			{ action: 'Check the achievement rate', examples: ['Show me the current KPI achievement status'] }
		],
		tips: [
			'KPI candidate targets are derived backward within the observed data range (designed so that no single variable is forced to carry an unreasonable burden)',
			'If the selected KPI candidates alone cannot reach the target, this is stated explicitly, and no forced extrapolated figures are produced',
			'The saved plan itself (model and backward-derivation results) stays fixed as of when it was saved, but the achievement rate is recalculated each time on the top page and each plan\'s detail page based on the latest values from the data source'
		],
		relatedPages: [{ label: 'KPI Management', href: '/kpi', description: 'List, create, and check achievement rates for KPI plans' }]
	},
	simulator: {
		title: 'Simulator Creation (Chat)',
		description: 'When you make a request in chat, a regression model (simulator) is generated from the data, and you can move variables around to try out future scenarios',
		operations: [
			{ action: 'Create a simulator', examples: ['Create a simulator that predicts sales from ad spend and store visits', 'I want to try what happens if XX changes'] },
			{ action: 'Check an existing simulator', examples: ['Show me the simulators I\'ve already created'] },
			{ action: 'Compare scenarios', examples: ['What if ad spend were 500,000 yen?', 'Compare an optimistic case with a pessimistic case'] }
		],
		tips: [
			'The AI proposes candidate objective and explanatory variables before generating the simulator (design_variables)',
			'After generation, an AI review (fit, sample size, and multicollinearity checks) runs automatically',
			'Currently the only supported analytical method is multiple regression (linear combination)',
			'If the coefficient of determination (R²) is low, try different explanatory variables or treat the result as a rough reference only',
			'If you want to use the screens under the "Analysis" section of the sidebar directly (regression analysis, sensitivity analysis, etc.), you can access them without going through chat',
			'Created simulators can be tried out with sliders from the "Simulators" page. On the detail page you can ask the AI assistant on the left about variables and coefficients'
		],
		relatedPages: [
			{ label: 'Simulators', href: '/simulators', description: 'List and operate created simulators' }
		]
	},
	email: {
		title: 'Sending Email',
		operations: [
			{ action: 'Compose and send an email', examples: ['Send an email to XX', 'Share the analysis results by email'] }
		],
		tips: [
			'The AI drafts the email; you review and edit the content in a form before sending',
			'The first time you use this, you need to configure the email service on the email settings screen'
		],
		relatedPages: [
			{ label: 'Email Settings', href: '/settings/email', description: 'Configure the email sending service' }
		]
	}
};

export function handleGetHelp(input: unknown) {
	const { topic } = getHelpInputSchema.parse(input ?? {});
	return HELP[topic ?? 'overview'];
}
