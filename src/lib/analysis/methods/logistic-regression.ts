import { Matrix, solve } from 'ml-matrix';
import type { FeatureRange } from '../types';

export type LogisticRegressionMetrics = {
	sampleSize: number;
	accuracy: number;
	precision: number;
	recall: number;
	f1: number;
	/** McFadden's pseudo-R²（切片のみのモデルと比べたあてはまりの改善度、0〜1に近いほど良い） */
	pseudoR2: number;
	iterations: number;
	converged: boolean;
};

export type ConfusionMatrix = {
	truePositive: number;
	falsePositive: number;
	trueNegative: number;
	falseNegative: number;
};

export type LogisticRegressionModel = {
	method: 'logistic_regression';
	targetColumn: string;
	featureColumns: string[];
	/** 目的変数のうち「1」として扱った値の元のラベル（例: "購入あり"） */
	positiveClassLabel: string;
	intercept: number;
	/** featureColumns と同じ順序の係数（対数オッズへの影響） */
	coefficients: number[];
	metrics: LogisticRegressionMetrics;
	confusionMatrix: ConfusionMatrix;
	featureRanges: Record<string, FeatureRange>;
};

export type LogisticRegressionRow = { features: number[]; target: 0 | 1 };

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/**
 * IRLS（Iteratively Reweighted Least Squares / Newton-Raphson法）でロジスティック回帰を解く。
 * OLSと異なり反復ごとに重みが変わるため正規方程式のサマリー統計量に還元できず、生の行データが必要
 * （呼び出し側でLOGISTIC_REGRESSION_MAX_ROWSまでに制限した行を渡すこと）。
 */
export function fitLogisticRegression(
	rows: LogisticRegressionRow[],
	targetColumn: string,
	featureColumns: string[],
	positiveClassLabel: string,
	opts: { maxIterations: number; tolerance: number }
): LogisticRegressionModel {
	const k = featureColumns.length;
	const n = rows.length;
	if (k === 0) throw new Error('説明変数が指定されていません');
	if (n <= k + 1) {
		throw new Error(`サンプル数（${n}件）が説明変数の数（${k}個）に対して不足しています`);
	}

	const positiveCount = rows.reduce((sum, r) => sum + r.target, 0);
	if (positiveCount === 0 || positiveCount === n) {
		throw new Error('目的変数が全て同じ値のため学習できません（正例・負例の両方のデータが必要です）');
	}

	const size = k + 1;
	let beta = new Array(size).fill(0);
	let converged = false;
	let iterations = 0;

	for (; iterations < opts.maxIterations; iterations++) {
		const eta = new Array(n);
		const p = new Array(n);
		for (let i = 0; i < n; i++) {
			let e = beta[0];
			for (let j = 0; j < k; j++) e += beta[j + 1] * rows[i].features[j];
			eta[i] = e;
			p[i] = sigmoid(e);
		}

		// 重み付き正規方程式 (XᵀWX)β = XᵀWz を構築する（W=diag(p(1-p))、z=working response）
		const xtwx = Matrix.zeros(size, size);
		const xtwz = Matrix.zeros(size, 1);

		for (let i = 0; i < n; i++) {
			// p(1-p)が0に近い（予測が0/1に飽和）場合の0除算を避ける下限
			const w = Math.max(p[i] * (1 - p[i]), 1e-8);
			const z = eta[i] + (rows[i].target - p[i]) / w;
			const xi = [1, ...rows[i].features];

			for (let a = 0; a < size; a++) {
				xtwz.set(a, 0, xtwz.get(a, 0) + w * xi[a] * z);
				for (let b = a; b < size; b++) {
					const val = w * xi[a] * xi[b];
					xtwx.set(a, b, xtwx.get(a, b) + val);
					if (b !== a) xtwx.set(b, a, xtwx.get(b, a) + val);
				}
			}
		}

		let betaNew: number[];
		try {
			betaNew = solve(xtwx, xtwz, true).to1DArray();
		} catch {
			throw new Error('モデルの学習に失敗しました（説明変数間の相関が強すぎるか、データが完全に分離している可能性があります）');
		}

		let maxDelta = 0;
		for (let i = 0; i < size; i++) maxDelta = Math.max(maxDelta, Math.abs(betaNew[i] - beta[i]));
		beta = betaNew;

		if (!beta.every(Number.isFinite)) {
			throw new Error('モデルの学習に失敗しました（数値計算が発散しました）');
		}
		if (maxDelta < opts.tolerance) {
			converged = true;
			iterations++;
			break;
		}
	}

	const intercept = beta[0];
	const coefficients = beta.slice(1);

	// 予測確率・混同行列・尤度ベースの指標を計算する
	let logLikelihood = 0;
	let truePositive = 0;
	let falsePositive = 0;
	let trueNegative = 0;
	let falseNegative = 0;

	for (const row of rows) {
		let e = intercept;
		for (let j = 0; j < k; j++) e += coefficients[j] * row.features[j];
		const p = sigmoid(e);
		const clamped = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
		logLikelihood += row.target === 1 ? Math.log(clamped) : Math.log(1 - clamped);

		const predicted = p >= 0.5 ? 1 : 0;
		if (predicted === 1 && row.target === 1) truePositive++;
		else if (predicted === 1 && row.target === 0) falsePositive++;
		else if (predicted === 0 && row.target === 0) trueNegative++;
		else falseNegative++;
	}

	const positiveRate = positiveCount / n;
	const nullLogLikelihood = positiveCount * Math.log(positiveRate) + (n - positiveCount) * Math.log(1 - positiveRate);
	const pseudoR2 = nullLogLikelihood !== 0 ? 1 - logLikelihood / nullLogLikelihood : 0;

	const accuracy = (truePositive + trueNegative) / n;
	const precision = truePositive + falsePositive > 0 ? truePositive / (truePositive + falsePositive) : 0;
	const recall = truePositive + falseNegative > 0 ? truePositive / (truePositive + falseNegative) : 0;
	const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

	const featureRanges: Record<string, FeatureRange> = {};
	featureColumns.forEach((col, j) => {
		const values = rows.map((r) => r.features[j]);
		const min = Math.min(...values);
		const max = Math.max(...values);
		const mean = values.reduce((s, v) => s + v, 0) / values.length;
		featureRanges[col] = { min, max, mean };
	});

	return {
		method: 'logistic_regression',
		targetColumn,
		featureColumns,
		positiveClassLabel,
		intercept,
		coefficients,
		metrics: { sampleSize: n, accuracy, precision, recall, f1, pseudoR2, iterations, converged },
		confusionMatrix: { truePositive, falsePositive, trueNegative, falseNegative },
		featureRanges
	};
}

/** 保存済みモデルから予測確率（0〜1、正例と判定した確率）を計算する純粋関数 */
export function predictLogisticRegression(model: LogisticRegressionModel, vars: Record<string, number>): number {
	let e = model.intercept;
	for (let i = 0; i < model.featureColumns.length; i++) {
		const col = model.featureColumns[i];
		const v = vars[col];
		if (typeof v !== 'number' || !Number.isFinite(v)) {
			throw new Error(`変数 ${col} の値が指定されていません`);
		}
		e += model.coefficients[i] * v;
	}
	return sigmoid(e);
}
