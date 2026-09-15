// Shared state for passing the current config, results, and setters back and forth between the
// layout (the right-side AI assistant) and each analysis page (regression, trend forecasting, etc.).
// Since SvelteKit's `{@render children()}` can't pass arbitrary props from a layout down to a
// child page, we bridge them via Svelte context instead.

export const ANALYSIS_BRIDGE_KEY = 'analysis-bridge';

export type AnalysisBridge = {
	analysisType:
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
	/** The current config values (snake_case, matching the key format used by the AI assistant's tool calls) */
	config: Record<string, unknown>;
	/** The current model's accuracy metrics, etc. Used as material for the AI assistant to answer questions about validity */
	resultSummary: Record<string, unknown> | null;
	/** Function for applying a patch to the page's state when the AI assistant calls the `set_config` tool. Registered by the page */
	applyConfig: ((patch: Record<string, unknown>) => void) | null;
};

export function createAnalysisBridge(): AnalysisBridge {
	const bridge = $state<AnalysisBridge>({
		analysisType: null,
		config: {},
		resultSummary: null,
		applyConfig: null
	});
	return bridge;
}
