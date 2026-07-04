import type { SufficientStats } from './types';
import { pearsonCorrelation, featurePairCorrelation } from './correlation';
import { combineOverall, type ValidityAssessment, type ValidityCheckItem } from './validity';

export type CorrelationMatrix = {
	columns: string[];
	/** matrix[i][j] = columns[i] と columns[j] のピアソン相関係数（対称、対角は1） */
	matrix: number[][];
	/** 相関の算出に使ったサンプル数（全列が非NULLの行数） */
	sampleSize: number;
};

/**
 * columns[0] を「目的変数」、それ以外を「説明変数」として computeSufficientStats を呼んだ結果から、
 * 全列ペアの相関行列を組み立てる。既存のサマリー統計量（Σx, Σxᵢxⱼ 等）だけで求まるため、
 * 新たなSQL集計は不要（columns[0]とのペアは pearsonCorrelation、それ以外のペアは featurePairCorrelation を使う）。
 */
export function buildCorrelationMatrix(stats: SufficientStats, columns: string[]): CorrelationMatrix {
	const n = columns.length;
	const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(1));

	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const corr = i === 0 ? pearsonCorrelation(stats, columns[j]) : featurePairCorrelation(stats, columns[i], columns[j]);
			matrix[i][j] = corr;
			matrix[j][i] = corr;
		}
	}

	return { columns, matrix, sampleSize: stats.n };
}

/** 相関行列の妥当性を評価する。サンプル数が少ないと相関係数の推定が不安定になるため、その一点をチェックする */
export function assessCorrelationValidity(result: CorrelationMatrix): ValidityAssessment {
	const checks: ValidityCheckItem[] = [];
	const n = result.sampleSize;

	if (n >= 30) {
		checks.push({ label: 'サンプル数', level: 'good', comment: `サンプル数${n}件は相関係数の推定に十分です` });
	} else if (n >= 10) {
		checks.push({ label: 'サンプル数', level: 'caution', comment: `サンプル数${n}件はやや少なく、相関係数が不安定になりやすいです（目安: 30件以上）` });
	} else {
		checks.push({ label: 'サンプル数', level: 'poor', comment: `サンプル数${n}件は不足しており、相関係数の信頼性が低い可能性があります（目安: 30件以上）` });
	}

	const { overallLevel, overallComment } = combineOverall(
		checks,
		'この相関分析は妥当性チェックの主要な観点で問題は見つかりませんでした'
	);
	return { overallLevel, overallComment, checks };
}
