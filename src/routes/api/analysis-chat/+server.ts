import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import { env } from '$env/dynamic/private';

type AnalysisChatEvent =
	| { type: 'delta'; text: string }
	| { type: 'config'; config: Record<string, unknown> }
	| { type: 'done' }
	| { type: 'error'; message: string };

function sse(event: AnalysisChatEvent): string {
	return `data: ${JSON.stringify(event)}\n\n`;
}

type SourceInfo = { id: string; name: string; columns: { key: string; label: string; type: string }[] };

const SET_CONFIG_TOOL: Tool = {
	name: 'set_config',
	description:
		'Sets the analysis screen configuration (data source, columns, forecast horizon) and reflects it in the UI. ' +
		'When the user describes what they want to analyze, choose the appropriate data source and columns from the provided data source list and call this tool. ' +
		'Only numeric columns can be used as the target variable; only date-typed columns can be used as the date column. ' +
		'If there are multiple candidates and it is hard to decide, or no column seems to match, ask a clarifying question instead of calling the tool.',
	input_schema: {
		type: 'object',
		properties: {
			data_source_id: { type: 'string', description: 'Data source ID' },
			target_column: { type: 'string', description: 'Column key of the target variable' },
			feature_columns: {
				type: 'array',
				items: { type: 'string' },
				description: 'Array of feature variable column keys (regression only)'
			},
			date_column: { type: 'string', description: 'Key of the date column (trend forecasting only)' },
			horizon_months: {
				type: 'number',
				enum: [6, 12, 60],
				description: 'Forecast horizon (in months). 6=up to 6 months ahead, 12=up to 1 year ahead, 60=up to 5 years ahead (trend forecasting only)'
			},
			granularity: {
				type: 'string',
				enum: ['day', 'week', 'month'],
				description: 'Aggregation granularity (trend forecasting only). day=daily, week=weekly, month=monthly. If not specified, keep it unchanged at month'
			},
			total_budget: {
				type: 'number',
				description: 'Total budget to allocate (budget allocation optimization only)'
			},
			group_column: {
				type: 'string',
				description: 'Key of the column that splits records into 2 groups (A/B testing only. Choose a column with exactly two distinct values)'
			},
			test_type: {
				type: 'string',
				enum: ['mean', 'proportion'],
				description: 'Test method (A/B testing only). mean=t-test for a difference in means (continuous metric), proportion=z-test for a difference in proportions (0/1 metric)'
			},
			methods: {
				type: 'array',
				items: { type: 'string', enum: ['correlation', 'regression', 'descriptive-stats', 'classification', 'ab-test'] },
				description:
					'Analysis methods to run on the report creation screen (multiple selection allowed, report creation only). ' +
					'correlation=correlation analysis, regression=regression analysis, descriptive-stats=descriptive statistics, classification=logistic regression (classification), ab-test=A/B testing. ' +
					'classification and ab-test may use a different target variable than the other three (e.g. regression targets revenue, classification targets churn).'
			}
		}
	}
};

type AnalysisType =
	| 'regression'
	| 'trend'
	| 'sensitivity'
	| 'scenario'
	| 'goal-seek'
	| 'monte-carlo'
	| 'budget-allocation'
	| 'correlation'
	| 'descriptive-stats'
	| 'ab-test'
	| 'classification'
	| 'report-create'
	| 'kpi-planning'
	| null;

function buildSystemPrompt(
	analysisType: AnalysisType,
	sources: SourceInfo[],
	config: Record<string, unknown>,
	resultSummary: Record<string, unknown> | null
): string {
	const sections: string[] = ['You are the AI assistant shown on the right side of the analysis screen.'];

	if (analysisType === 'regression') {
		sections.push(
			'The current screen is "Regression Analysis". It simulates how the target variable changes as feature variables are adjusted. ' +
				'Setting the data source, target variable (numeric column), and feature variables (numeric columns, multiple allowed) will display the results.'
		);
	} else if (analysisType === 'trend') {
		sections.push(
			'The current screen is "Trend Forecasting". It forecasts a future trend line from time series data. ' +
				'Setting the data source, date column, target variable (numeric column), forecast horizon (6 months/1 year/5 years), and aggregation granularity (daily/weekly/monthly, defaults to monthly) ' +
				'will display the results. After the results are shown, the underlying data grid becomes editable, and changing a number or date immediately recomputes the forecast.'
		);
	} else if (analysisType === 'sensitivity') {
		sections.push(
			'The current screen is "Sensitivity Analysis". After training a regression model, it shows in a tornado chart how much the target variable swings ' +
				'when each feature variable is moved across its full observed range. Setting the data source, target variable (numeric column), and feature variables (numeric columns, multiple allowed) ' +
				'will display the results. "Which variable matters most" is the one with the largest swing in the chart.'
		);
	} else if (analysisType === 'scenario') {
		sections.push(
			'The current screen is "Scenario Comparison". After training a regression model, it prepares several combinations of feature variable values (scenarios) and ' +
				'compares the predicted target variable values in a side-by-side bar chart. Setting the data source, target variable (numeric column), and feature variables (numeric columns, multiple allowed) ' +
				'will display the results. Please edit the specific values for each scenario in the grid at the bottom of the screen (this assistant cannot set the scenario values themselves).'
		);
	} else if (analysisType === 'goal-seek') {
		sections.push(
			'The current screen is "Goal Seek". After training a regression model, it works backward to find what a given feature variable ' +
				'should be in order for the target variable to reach a target value. Setting the data source, target variable (numeric column), and feature variables (numeric columns, multiple allowed) ' +
				'will display the results. Please select and enter the variable to solve for, the target value, and the fixed values of the other variables on screen.'
		);
	} else if (analysisType === 'monte-carlo') {
		sections.push(
			'The current screen is "Monte Carlo Simulation". After training a regression model, it assigns a distribution (uniform/normal/triangular/fixed value) to each feature variable, ' +
				'draws a large number of samples, and shows the resulting spread of the target variable (mean, standard deviation, percentiles, histogram). ' +
				'Setting the data source, target variable (numeric column), and feature variables (numeric columns, multiple allowed) will display the results. ' +
				'The distribution type and parameters for each variable, the sample count, and the threshold cannot be set by this assistant, so please direct the user to enter them on screen.'
		);
	} else if (analysisType === 'budget-allocation') {
		sections.push(
			'The current screen is "Budget Allocation Optimization (Marketing Mix)". After training a regression model, it treats the feature variables ' +
				'as budget-allocated channels (e.g. ad spend) and allocates a specified total budget across the upper/lower bounds of each channel (default: observed range) ' +
				'to maximize the target variable (e.g. revenue). Setting the data source, target variable (numeric column), and channels (feature variables, numeric columns, multiple allowed) ' +
				'will display the results. If a total budget (total_budget) is mentioned, set that as well. Please adjust the upper/lower bounds for each channel on screen.'
		);
	} else if (analysisType === 'correlation') {
		sections.push(
			'The current screen is "Correlation Analysis". It computes the Pearson correlation coefficient between the selected columns and displays it as a heatmap. ' +
				'Setting the data source and the columns to see correlations for (numeric columns, 2 or more in feature_columns) will display the results. ' +
				'There is no concept of a target variable here; unlike regression analysis, it shows the correlation of every pair among the chosen columns as a symmetric matrix.'
		);
	} else if (analysisType === 'descriptive-stats') {
		sections.push(
			'The current screen is "Descriptive Statistics". It shows the count, mean, median, standard deviation, min/max, quartiles, and ' +
				'a histogram for each selected column. Setting the data source and the columns to see statistics for (numeric columns, 1 or more in feature_columns) will display the results. ' +
				'There is no concept of a target variable here; unlike regression analysis, each selected column is summarized independently.'
		);
	} else if (analysisType === 'ab-test') {
		sections.push(
			'The current screen is "A/B Testing / Significance Testing". It tests whether there is a statistically significant difference in a metric between two groups. ' +
				'Setting the data source, group column (group_column, a column with exactly two distinct values, e.g. Treatment A/Treatment B), metric column (target_column, numeric column), and ' +
				'test method (test_type. mean=t-test for continuous metrics, proportion=z-test for 0/1 metrics) will display the results. ' +
				'A p-value below 0.05 is treated as a statistically significant difference.'
		);
	} else if (analysisType === 'classification') {
		sections.push(
			'The current screen is "Logistic Regression / Classification". When the target variable is binary (e.g. purchased/not purchased, churned/not churned), ' +
				'this screen builds a model that predicts that probability from feature variables. Setting the data source, target variable (a binary column, target_column), and ' +
				'feature variables (numeric columns, multiple allowed, feature_columns) will display the results. ' +
				'Accuracy, precision, recall, the confusion matrix, and odds ratios are shown. The difference from regression analysis (predicting a continuous value) is that the target variable is binary.'
		);
	} else if (analysisType === 'report-create') {
		sections.push(
			'The current screen is "Report Creation". It runs a combination of methods chosen by the user — correlation analysis, regression analysis, descriptive statistics, ' +
				'logistic regression (classification), and A/B testing — together, and produces a report based on the results (works with just one method or a combination of several). ' +
				'When the user describes what they want to do, first set which methods to include via methods. ' +
				'Correlation analysis, regression analysis, and descriptive statistics share target_column (target variable) and feature_columns (feature variables). ' +
				'classification requires a binary target variable; if the user wants to use a different target variable than the other methods, this assistant cannot set that, so ' +
				'direct them to the dedicated input field on screen. ab-test (A/B testing) uses group_column and test_type. ' +
				'The report itself must be generated from the dedicated button on screen (not the AI assistant\'s "Create Report" button).'
		);
	} else if (analysisType === 'kpi-planning') {
		sections.push(
			'The current screen is "KPI Planning". After the user specifies a target value for the target variable (e.g. revenue), it trains a regression model and ' +
				'works backward to find target values for the selected KPI candidates (feature variables) that stay within their observed ranges. ' +
				'Setting the data source, target variable (target_column), and KPI candidates (feature_columns) will display the results. ' +
				'Please enter and adjust the target value and period on screen.'
		);
	} else {
		sections.push(
			'The user has not yet opened an analysis screen (regression analysis, sensitivity analysis, scenario comparison, goal seek, trend forecasting, Monte Carlo simulation, ' +
				'budget allocation optimization, correlation analysis, descriptive statistics, A/B testing, logistic regression, report creation, or KPI planning). ' +
				'Ask what they want to analyze and direct them to open the appropriate screen from the sidebar (this assistant can help configure a screen once it is open).'
		);
	}

	if (sources.length > 0) {
		const sourceList = sources
			.map((s) => {
				const cols = s.columns.map((c) => `${c.label} (key: ${c.key}, type: ${c.type})`).join(', ');
				return `- "${s.name}" (id: ${s.id}): ${cols}`;
			})
			.join('\n');
		sections.push(`Available data sources:\n${sourceList}`);
	} else {
		sections.push('There are currently no available data sources. Please direct the user to first create one at /database.');
	}

	if (Object.keys(config).length > 0) {
		sections.push(`Current configuration:\n${JSON.stringify(config, null, 2)}`);
	}

	if (resultSummary) {
		sections.push(
			`Current analysis result (use this to answer if asked about validity; an R² closer to 1 indicates a better fit):\n${JSON.stringify(resultSummary, null, 2)}`
		);
	}

	sections.push(
		'When the user describes what they want to analyze, reflect the configuration using the set_config tool. ' +
			'Answer usage questions concisely. Keep responses brief.'
	);

	return sections.join('\n\n');
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const mockMode = platform?.env?.MOCK_AI === 'true' || env.MOCK_AI === 'true';

	const body = (await request.json()) as {
		message: string;
		analysisType: AnalysisType;
		sources: SourceInfo[];
		config: Record<string, unknown>;
		resultSummary: Record<string, unknown> | null;
		history: { role: 'user' | 'assistant'; text: string }[];
	};

	if (mockMode) {
		const stream = new ReadableStream({
			async start(controller) {
				const enqueue = (e: AnalysisChatEvent) => controller.enqueue(new TextEncoder().encode(sse(e)));
				await new Promise((r) => setTimeout(r, 300));
				for (const char of 'Thank you for your question.') {
					enqueue({ type: 'delta', text: char });
					await new Promise((r) => setTimeout(r, 20));
				}
				enqueue({ type: 'done' });
				controller.close();
			}
		});
		return new Response(stream, {
			headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
		});
	}

	const apiKey = platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY ?? '';
	if (!apiKey) {
		return new Response(sse({ type: 'error', message: 'ANTHROPIC_API_KEY not set' }), {
			headers: { 'Content-Type': 'text/event-stream' }
		});
	}

	const systemPrompt = buildSystemPrompt(body.analysisType, body.sources, body.config, body.resultSummary);
	const messages: MessageParam[] = [
		...body.history.map((m) => ({ role: m.role, content: m.text })),
		{ role: 'user', content: body.message }
	];

	const anthropic = new Anthropic({ apiKey });

	const stream = new ReadableStream({
		async start(controller) {
			const enqueue = (e: AnalysisChatEvent) => controller.enqueue(new TextEncoder().encode(sse(e)));
			try {
				const claudeStream = anthropic.messages.stream({
					model: 'claude-haiku-4-5-20251001',
					max_tokens: 1024,
					system: systemPrompt,
					tools: [SET_CONFIG_TOOL],
					messages
				});

				let currentTool: { name: string; inputJson: string } | null = null;
				const toolBlocks: { name: string; inputJson: string }[] = [];

				for await (const event of claudeStream) {
					if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
						currentTool = { name: event.content_block.name, inputJson: '' };
					} else if (event.type === 'content_block_delta') {
						if (event.delta.type === 'text_delta') {
							enqueue({ type: 'delta', text: event.delta.text });
						} else if (event.delta.type === 'input_json_delta' && currentTool) {
							currentTool.inputJson += event.delta.partial_json;
						}
					} else if (event.type === 'content_block_stop' && currentTool) {
						toolBlocks.push(currentTool);
						currentTool = null;
					}
				}

				for (const tool of toolBlocks) {
					if (tool.name !== 'set_config') continue;
					try {
						const config = JSON.parse(tool.inputJson || '{}');
						enqueue({ type: 'config', config });
					} catch {
						// Malformed tool input JSON; ignore it and deliver only the text response
					}
				}

				enqueue({ type: 'done' });
			} catch (e) {
				enqueue({ type: 'error', message: e instanceof Error ? e.message : String(e) });
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
	});
};
