import Anthropic from '@anthropic-ai/sdk';

export type AnalysisReportInput = {
	analysisType: string;
	config: Record<string, unknown>;
	resultSummary: Record<string, unknown>;
};

const ANALYSIS_TYPE_LABELS: Record<string, string> = {
	regression: 'Regression analysis',
	sensitivity: 'Sensitivity analysis',
	scenario: 'Scenario comparison',
	'goal-seek': 'Goal seek',
	trend: 'Trend forecast',
	'monte-carlo': 'Monte Carlo simulation',
	'budget-allocation': 'Budget allocation optimization',
	correlation: 'Correlation analysis',
	'descriptive-stats': 'Descriptive statistics',
	'ab-test': 'A/B test / significance test',
	classification: 'Logistic regression / classification',
	'kpi-planning': 'KPI planning'
};

const SYSTEM_PROMPT = `You are an assistant that summarizes data analysis results into a business-facing report.
Base the report only on the given analysis config and result summary (resultSummary, which includes validity check results).
Do not invent any numbers that are not present in resultSummary.

Output must be in Markdown format, and must follow this structure exactly:

# (A specific report title that makes the analysis content clear at a glance)

## Overview
Explain in 1-2 sentences what was analyzed

## Key findings
Bullet points describing specific facts drawn from the results (cite numbers from resultSummary)

## Statistical validity
Cite specific figures from resultSummary's validity (overall/comment), R², p-value, sample size, etc.,
and explain the validity in the style of "This result can be considered valid because XX is YY."
If there are concerns (e.g. validity is caution/poor), be sure to point them out clearly.

## Recommended next actions
Based on the results, briefly suggest 1-3 next steps

Write in English, in a concise and natural business-document style. Do not include any preamble or closing remarks beyond the headings.`;

async function callClaude(apiKey: string, systemPrompt: string, userMessage: string, model: string): Promise<string> {
	const anthropic = new Anthropic({ apiKey, timeout: 30000 });
	const response = await anthropic.messages.create({
		model,
		max_tokens: 2048,
		system: systemPrompt,
		messages: [{ role: 'user', content: userMessage }]
	});
	const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
	if (!text) throw new Error('Failed to generate the report.');
	return text;
}

export async function generateAnalysisReport(
	apiKey: string,
	input: AnalysisReportInput,
	model = 'claude-haiku-4-5-20251001'
): Promise<string> {
	const label = ANALYSIS_TYPE_LABELS[input.analysisType] ?? input.analysisType;
	const userMessage = [
		`Analysis method: ${label}`,
		'',
		'Config:',
		JSON.stringify(input.config, null, 2),
		'',
		'Results:',
		JSON.stringify(input.resultSummary, null, 2)
	].join('\n');

	return callClaude(apiKey, SYSTEM_PROMPT, userMessage, model);
}

const COMPOSITE_SYSTEM_PROMPT = `You are an assistant that summarizes data analysis results into a business-facing report.
This time you are creating a report that integrates the results of running several different analysis methods on the same data.
Base it only on the given analyses (analysisType/config/resultSummary, which include validity check results). Do not invent any numbers that are not present.

**Important notes**:
- Do not combine the results of multiple analyses into a single "composite score" or "combined confidence level" (a simple average or combination of p-values is statistically invalid). Treat each analysis's results as independent.
- Interpret whether the conclusions agree or conflict across methods: if they agree, explain that this increases confidence in the conclusion; if they conflict, explain that neither should be taken at face value and further verification is needed.
- Mention the "multiple comparisons problem" — running several tests/analyses at once increases the chance that one of them shows a significant result purely by chance — and avoid overly conclusive statements as a result.

Output must be in Markdown format, and must follow this structure exactly:

# (A specific report title that makes the analysis content clear at a glance)

## Overview
Explain in 1-2 sentences what data was analyzed and which methods were combined

## Results by analysis
Use a subheading for each analysis, and describe its key findings and validity check results with specific figures

## Overall interpretation
Interpret whether the conclusions agree or conflict across methods. Include a mention of the multiple comparisons problem. Do not produce a single composite score.

## Recommended next actions
Based on the results, briefly suggest 1-3 next steps

Write in English, in a concise and natural business-document style. Do not include any preamble or closing remarks beyond the headings.`;

export async function generateCompositeAnalysisReport(
	apiKey: string,
	analyses: AnalysisReportInput[],
	model = 'claude-haiku-4-5-20251001'
): Promise<string> {
	const userMessage = analyses
		.map((a, i) => {
			const label = ANALYSIS_TYPE_LABELS[a.analysisType] ?? a.analysisType;
			return [
				`--- Analysis ${i + 1}: ${label} ---`,
				'Config:',
				JSON.stringify(a.config, null, 2),
				'Results:',
				JSON.stringify(a.resultSummary, null, 2)
			].join('\n');
		})
		.join('\n\n');

	return callClaude(apiKey, COMPOSITE_SYSTEM_PROMPT, userMessage, model);
}

/**
 * Entry point for the "report creation" screen. If exactly one analysis is selected, uses the
 * single-analysis prompt (no need for the multiple-comparisons caveat); if more than one is
 * selected, uses the composite-analysis prompt.
 */
export async function generateReport(
	apiKey: string,
	analyses: AnalysisReportInput[],
	model = 'claude-haiku-4-5-20251001'
): Promise<string> {
	if (analyses.length === 1) return generateAnalysisReport(apiKey, analyses[0], model);
	return generateCompositeAnalysisReport(apiKey, analyses, model);
}
