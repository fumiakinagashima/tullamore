// 各分析モジュール共通の「妥当性チェック」の型と、判定ロジックのうちDBに依存しない純粋な部分。
// 多重共線性チェック等サマリー統計量が必要なものは server/analysis/validity.ts（D1依存）が担当する。

export type ValidityLevel = 'good' | 'caution' | 'poor';

export type ValidityCheckItem = {
	/** チェック項目名（例: 「当てはまりの良さ」） */
	label: string;
	level: ValidityLevel;
	comment: string;
};

export type ValidityAssessment = {
	overallLevel: ValidityLevel;
	overallComment: string;
	checks: ValidityCheckItem[];
};

/** 決定係数R²から当てはまりの良さを評価する（review.tsのassessFitと同じ閾値） */
export function assessFitQuality(r2: number): ValidityCheckItem {
	if (r2 >= 0.8) return { label: '当てはまりの良さ', level: 'good', comment: `R²=${r2.toFixed(3)}で当てはまりは非常に良好です` };
	if (r2 >= 0.5) return { label: '当てはまりの良さ', level: 'good', comment: `R²=${r2.toFixed(3)}で当てはまりは良好です` };
	if (r2 >= 0.3) return { label: '当てはまりの良さ', level: 'caution', comment: `R²=${r2.toFixed(3)}で当てはまりはやや弱く、参考程度に留めてください` };
	return { label: '当てはまりの良さ', level: 'poor', comment: `R²=${r2.toFixed(3)}で当てはまりが弱く、この説明変数では十分に予測できていません` };
}

/**
 * サンプル数が説明変数の数（パラメータ数）に対して十分かを評価する。
 * 目安は「パラメータ数×10件以上」（review.tsのassessSampleSizeと同じ経験則）。
 */
export function assessSampleSizeAdequacy(sampleSize: number, paramCount: number): ValidityCheckItem {
	const ideal = 10 * (paramCount + 1);
	const marginal = 5 * (paramCount + 1);
	if (sampleSize >= ideal) {
		return { label: 'サンプル数', level: 'good', comment: `サンプル数${sampleSize}件は説明変数${paramCount}個に対して十分です` };
	}
	if (sampleSize >= marginal) {
		return {
			label: 'サンプル数',
			level: 'caution',
			comment: `サンプル数${sampleSize}件は説明変数${paramCount}個に対してやや少なめです（目安: ${ideal}件以上）。データを追加できると信頼性が上がります`
		};
	}
	return {
		label: 'サンプル数',
		level: 'poor',
		comment: `サンプル数${sampleSize}件は説明変数${paramCount}個に対して不足しています（目安: ${ideal}件以上）。係数の信頼性が低い可能性があります`
	};
}

/** 個々のチェック結果から全体の妥当性レベル・総評コメントをまとめる */
export function combineOverall(checks: ValidityCheckItem[], goodComment: string): { overallLevel: ValidityLevel; overallComment: string } {
	if (checks.some((c) => c.level === 'poor')) {
		return {
			overallLevel: 'poor',
			overallComment: 'この分析結果は参考程度に留め、重要な意思決定には別の裏付けも確認することを推奨します'
		};
	}
	if (checks.some((c) => c.level === 'caution')) {
		return {
			overallLevel: 'caution',
			overallComment: '基本的な妥当性は確保されていますが、一部の項目に注意点があります'
		};
	}
	return { overallLevel: 'good', overallComment: goodComment };
}
