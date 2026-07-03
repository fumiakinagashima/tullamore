// レイアウト（右側のAIアシスタント）と各分析ページ（回帰分析・トレンド予測）の間で
// 現在の設定値・結果・setterをやり取りするための共有状態。SvelteKitの `{@render children()}` は
// レイアウトから子ページへ任意のpropsを渡せないため、Svelteのcontextで橋渡しする。

export const ANALYSIS_BRIDGE_KEY = 'analysis-bridge';

export type AnalysisBridge = {
	analysisType: 'regression' | 'trend' | 'sensitivity' | 'scenario' | 'goal-seek' | null;
	/** 現在の設定値（スネークケース。AIアシスタントのツール呼び出しと同じキー形式に揃える） */
	config: Record<string, unknown>;
	/** 現在のモデルの精度指標等。AIアシスタントが妥当性について答える際の材料にする */
	resultSummary: Record<string, unknown> | null;
	/** AIアシスタントが `set_config` ツールを呼んだ時に、ページ側のstateへ反映するための関数。ページが登録する */
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
