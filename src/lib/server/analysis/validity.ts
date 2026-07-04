import { maxFeaturePairCorrelation } from '$lib/analysis/correlation';
import type { LinearRegressionModel } from '$lib/analysis/types';
import {
	assessFitQuality,
	assessSampleSizeAdequacy,
	combineOverall,
	type ValidityAssessment,
	type ValidityCheckItem
} from '$lib/analysis/validity';
import { computeSufficientStats } from './sufficient-stats';

/**
 * 回帰結合モデル（線形/ロジスティック回帰の派生を含む線形結合モデル全般）の妥当性を評価する。
 * 当てはまり（R²）・サンプル数の十分性・説明変数どうしの多重共線性をチェックする。
 * `review.ts`（chat経由で作成する永続シミュレーター向け）と判定ロジックは共通（$lib/analysis/validity.ts）だが、
 * こちらはサイドバーの `/analysis/*` 分析モジュール向けに汎用の ValidityAssessment 形式で返す。
 *
 * 多重共線性は「係数の解釈」の信頼性に関わる問題であり、当てはまり・サンプル数（＝予測そのものの
 * 信頼性）とは性質が異なるため、総合判定を最も厳しい 'poor' まで引き上げず 'caution' に留める
 * （review.ts の既存の重み付けを踏襲）。
 */
export async function assessRegressionValidity(
	db: D1Database,
	tableName: string,
	model: LinearRegressionModel
): Promise<ValidityAssessment> {
	const checks: ValidityCheckItem[] = [
		assessFitQuality(model.metrics.r2),
		assessSampleSizeAdequacy(model.metrics.sampleSize, model.featureColumns.length)
	];

	if (model.featureColumns.length >= 2) {
		const stats = await computeSufficientStats(db, tableName, model.targetColumn, model.featureColumns);
		const pair = maxFeaturePairCorrelation(stats, model.featureColumns);
		if (pair) {
			const abs = Math.abs(pair.correlation);
			if (abs >= 0.9) {
				checks.push({
					label: '多重共線性',
					level: 'caution',
					comment: `説明変数「${pair.columnA}」と「${pair.columnB}」の相関が非常に強く（r=${pair.correlation.toFixed(3)}）、多重共線性の疑いがあります。どちらか一方を除外するか、係数の解釈には注意してください`
				});
			} else if (abs >= 0.7) {
				checks.push({
					label: '多重共線性',
					level: 'caution',
					comment: `説明変数「${pair.columnA}」と「${pair.columnB}」の相関がやや強めです（r=${pair.correlation.toFixed(3)}）。多重共線性に注意してください`
				});
			} else {
				checks.push({ label: '多重共線性', level: 'good', comment: '説明変数間に強い相関は見られません' });
			}
		}
	}

	const { overallLevel, overallComment } = combineOverall(
		checks,
		'この分析結果は妥当性チェックの主要な観点で問題は見つかりませんでした'
	);
	return { overallLevel, overallComment, checks };
}
