import { twoTailedPValueFromT, twoTailedPValueFromZ, studentTInverseCDF, normalInverseCDF } from './statistics';
import { combineOverall, type ValidityAssessment, type ValidityCheckItem } from './validity';

export type GroupMeanStats = { group: string; n: number; mean: number; variance: number };
export type GroupProportionStats = { group: string; n: number; successes: number };

export type TTestResult = {
	kind: 'mean';
	groupA: GroupMeanStats;
	groupB: GroupMeanStats;
	meanDiff: number;
	tStat: number;
	df: number;
	pValue: number;
	ci95: [number, number];
	significant: boolean;
};

export type ProportionTestResult = {
	kind: 'proportion';
	groupA: GroupProportionStats;
	groupB: GroupProportionStats;
	propA: number;
	propB: number;
	diff: number;
	zStat: number;
	pValue: number;
	ci95: [number, number];
	significant: boolean;
};

/**
 * Welchのt検定（等分散を仮定しない2標本の平均の差の検定）。A/Bテストで「施策Aと施策Bで
 * 平均値（購入額など連続値の指標）に有意差があるか」を調べるのに使う。
 */
export function welchTTest(a: GroupMeanStats, b: GroupMeanStats, alpha: number): TTestResult {
	const seA2 = a.variance / a.n;
	const seB2 = b.variance / b.n;
	const se = Math.sqrt(seA2 + seB2);
	const meanDiff = a.mean - b.mean;
	const tStat = se === 0 ? 0 : meanDiff / se;

	// Welch–Satterthwaite の自由度
	const df =
		seA2 === 0 && seB2 === 0
			? a.n + b.n - 2
			: (seA2 + seB2) ** 2 / ((seA2 * seA2) / (a.n - 1) + (seB2 * seB2) / (b.n - 1));

	const pValue = twoTailedPValueFromT(tStat, df);
	const tCrit = studentTInverseCDF(1 - alpha / 2, df);
	const margin = tCrit * se;

	return {
		kind: 'mean',
		groupA: a,
		groupB: b,
		meanDiff,
		tStat,
		df,
		pValue,
		ci95: [meanDiff - margin, meanDiff + margin],
		significant: pValue < alpha
	};
}

/**
 * 2標本の比率のz検定（不等分散を仮定、Welchのt検定と対になる標準的な手法）。
 * 「施策Aと施策Bでコンバージョン率に有意差があるか」のような2値指標に使う。
 * z²はこの2群比較において2×2のカイ二乗検定の統計量と数学的に同値（p値も一致する）。
 */
export function twoProportionZTest(a: GroupProportionStats, b: GroupProportionStats, alpha: number): ProportionTestResult {
	const propA = a.successes / a.n;
	const propB = b.successes / b.n;
	const diff = propA - propB;

	// 不等分散（unpooled）の標準誤差を使う（信頼区間はこちらが標準的）
	const seA2 = (propA * (1 - propA)) / a.n;
	const seB2 = (propB * (1 - propB)) / b.n;
	const se = Math.sqrt(seA2 + seB2);
	const zStat = se === 0 ? 0 : diff / se;
	const pValue = twoTailedPValueFromZ(zStat);

	const zCrit = normalInverseCDF(1 - alpha / 2);
	const margin = zCrit * se;

	return {
		kind: 'proportion',
		groupA: a,
		groupB: b,
		propA,
		propB,
		diff,
		zStat,
		pValue,
		ci95: [diff - margin, diff + margin],
		significant: pValue < alpha
	};
}

/**
 * 検定結果の妥当性を評価する。サンプル数の十分性（目安: グループごとに30件以上）に加え、
 * 比率の検定では正規近似が成り立つ条件（各グループで成功/失敗の期待件数がともに5件以上、
 * 二項分布を正規分布で近似する際の標準的な経験則）もチェックする。
 */
export function assessAbTestValidity(result: TTestResult | ProportionTestResult): ValidityAssessment {
	const checks: ValidityCheckItem[] = [];
	const minN = Math.min(result.groupA.n, result.groupB.n);

	if (minN >= 30) {
		checks.push({ label: 'サンプル数', level: 'good', comment: `両グループとも十分なサンプル数があります（最小n=${minN}）` });
	} else if (minN >= 10) {
		checks.push({
			label: 'サンプル数',
			level: 'caution',
			comment: `サンプル数がやや少なめです（最小n=${minN}）。目安はグループごとに30件以上です`
		});
	} else {
		checks.push({
			label: 'サンプル数',
			level: 'poor',
			comment: `サンプル数が不足しています（最小n=${minN}）。検定結果の信頼性が低い可能性があります（目安: グループごとに30件以上）`
		});
	}

	if (result.kind === 'proportion') {
		const aOk = result.groupA.n * result.propA >= 5 && result.groupA.n * (1 - result.propA) >= 5;
		const bOk = result.groupB.n * result.propB >= 5 && result.groupB.n * (1 - result.propB) >= 5;
		if (aOk && bOk) {
			checks.push({
				label: '正規近似の妥当性',
				level: 'good',
				comment: '両グループとも正規近似が有効な条件（成功・失敗ともに期待件数5件以上）を満たしています'
			});
		} else {
			checks.push({
				label: '正規近似の妥当性',
				level: 'caution',
				comment: '成功または失敗の件数が少なく、正規近似に基づくp値の精度が低下している可能性があります'
			});
		}
	}

	const { overallLevel, overallComment } = combineOverall(
		checks,
		'この検定は妥当性チェックの主要な観点で問題は見つかりませんでした'
	);
	return { overallLevel, overallComment, checks };
}
