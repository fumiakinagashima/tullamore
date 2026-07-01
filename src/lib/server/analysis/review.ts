import { maxFeaturePairCorrelation } from '$lib/analysis/correlation';
import type { LinearRegressionModel } from '$lib/analysis/types';
import { computeSufficientStats } from './sufficient-stats';

export type SimulatorReview = {
	fitQuality: 'excellent' | 'good' | 'moderate' | 'weak';
	fitComment: string;
	sampleSizeAdequacy: 'sufficient' | 'marginal' | 'insufficient';
	sampleSizeComment: string;
	multicollinearity: { columnA: string; columnB: string; correlation: number } | null;
	multicollinearityComment: string | null;
	overallComment: string;
};

function assessFit(r2: number): { fitQuality: SimulatorReview['fitQuality']; fitComment: string } {
	if (r2 >= 0.8) return { fitQuality: 'excellent', fitComment: `R²=${r2.toFixed(3)}で当てはまりは非常に良好です` };
	if (r2 >= 0.5) return { fitQuality: 'good', fitComment: `R²=${r2.toFixed(3)}で当てはまりは良好です` };
	if (r2 >= 0.3) return { fitQuality: 'moderate', fitComment: `R²=${r2.toFixed(3)}で当てはまりはやや弱く、参考程度に留めてください` };
	return { fitQuality: 'weak', fitComment: `R²=${r2.toFixed(3)}で当てはまりが弱く、この説明変数では十分に予測できていません` };
}

function assessSampleSize(
	sampleSize: number,
	featureCount: number
): { sampleSizeAdequacy: SimulatorReview['sampleSizeAdequacy']; sampleSizeComment: string } {
	const ideal = 10 * (featureCount + 1);
	const marginal = 5 * (featureCount + 1);
	if (sampleSize >= ideal) {
		return { sampleSizeAdequacy: 'sufficient', sampleSizeComment: `サンプル数${sampleSize}件は説明変数${featureCount}個に対して十分です` };
	}
	if (sampleSize >= marginal) {
		return {
			sampleSizeAdequacy: 'marginal',
			sampleSizeComment: `サンプル数${sampleSize}件は説明変数${featureCount}個に対してやや少なめです（目安: ${ideal}件以上）。データを追加できると信頼性が上がります`
		};
	}
	return {
		sampleSizeAdequacy: 'insufficient',
		sampleSizeComment: `サンプル数${sampleSize}件は説明変数${featureCount}個に対して不足しています（目安: ${ideal}件以上）。係数の信頼性が低い可能性があります`
	};
}

/**
 * シミュレーターの妥当性をチェックする。当てはまり（R²）・サンプル数の十分性・
 * 説明変数どうしの多重共線性を評価する。多重共線性の判定に必要な相関係数は
 * サマリー統計量（Σx, Σxᵢxⱼ）から算出し、生データは読み込まない。
 */
export async function reviewSimulator(
	db: D1Database,
	tableName: string,
	model: LinearRegressionModel
): Promise<SimulatorReview> {
	const { fitQuality, fitComment } = assessFit(model.metrics.r2);
	const { sampleSizeAdequacy, sampleSizeComment } = assessSampleSize(
		model.metrics.sampleSize,
		model.featureColumns.length
	);

	let multicollinearity: SimulatorReview['multicollinearity'] = null;
	let multicollinearityComment: string | null = null;
	if (model.featureColumns.length >= 2) {
		const stats = await computeSufficientStats(db, tableName, model.targetColumn, model.featureColumns);
		multicollinearity = maxFeaturePairCorrelation(stats, model.featureColumns);
		if (multicollinearity && Math.abs(multicollinearity.correlation) >= 0.9) {
			multicollinearityComment = `説明変数「${multicollinearity.columnA}」と「${multicollinearity.columnB}」の相関が非常に強く（r=${multicollinearity.correlation.toFixed(3)}）、多重共線性の疑いがあります。どちらか一方を除外するか、係数の解釈には注意してください`;
		} else if (multicollinearity && Math.abs(multicollinearity.correlation) >= 0.7) {
			multicollinearityComment = `説明変数「${multicollinearity.columnA}」と「${multicollinearity.columnB}」の相関がやや強めです（r=${multicollinearity.correlation.toFixed(3)}）。多重共線性に注意してください`;
		}
	}

	const overallComment =
		fitQuality === 'weak' || sampleSizeAdequacy === 'insufficient'
			? 'このシミュレーターの予測は参考程度に留め、重要な意思決定には別の裏付けも確認することを推奨します'
			: multicollinearityComment
				? '基本的な精度は確保されていますが、説明変数の相関には注意してください'
				: 'このシミュレーターは妥当性チェックの主要な観点で問題は見つかりませんでした';

	return { fitQuality, fitComment, sampleSizeAdequacy, sampleSizeComment, multicollinearity, multicollinearityComment, overallComment };
}
