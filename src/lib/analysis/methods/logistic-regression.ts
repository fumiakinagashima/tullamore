import { Matrix, solve } from 'ml-matrix';
import type { FeatureRange } from '../types';
import { assessSampleSizeAdequacy, combineOverall, type ValidityAssessment, type ValidityCheckItem } from '../validity';

export type LogisticRegressionMetrics = {
	sampleSize: number;
	accuracy: number;
	precision: number;
	recall: number;
	f1: number;
	/** McFadden's pseudo-R² (improvement in fit compared to an intercept-only model; closer to 0–1 is better) */
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
	/** The original label of the value treated as "1" in the target variable (e.g. "Purchased") */
	positiveClassLabel: string;
	intercept: number;
	/** Coefficients in the same order as featureColumns (effect on log-odds) */
	coefficients: number[];
	metrics: LogisticRegressionMetrics;
	confusionMatrix: ConfusionMatrix;
	featureRanges: Record<string, FeatureRange>;
};

export type LogisticRegressionRow = { features: number[]; target: 0 | 1 };

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/**
 * Solves logistic regression using IRLS (Iteratively Reweighted Least Squares / Newton-Raphson method).
 * Unlike OLS, the weights change on every iteration, so the problem can't be reduced to summary statistics
 * for the normal equations — raw row data is required (the caller must pass rows already limited to
 * LOGISTIC_REGRESSION_MAX_ROWS).
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
	if (k === 0) throw new Error('No feature columns specified');
	if (n <= k + 1) {
		throw new Error(`The sample size (${n}) is insufficient for the number of features (${k})`);
	}

	const positiveCount = rows.reduce((sum, r) => sum + r.target, 0);
	if (positiveCount === 0 || positiveCount === n) {
		throw new Error('Cannot train because the target variable has only one value (both positive and negative examples are required)');
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

		// Build the weighted normal equations (XᵀWX)β = XᵀWz (W=diag(p(1-p)), z=working response)
		const xtwx = Matrix.zeros(size, size);
		const xtwz = Matrix.zeros(size, 1);

		for (let i = 0; i < n; i++) {
			// Lower bound to avoid division by zero when p(1-p) approaches 0 (prediction saturating at 0/1)
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
			throw new Error('Failed to train the model (features may be too strongly correlated, or the data may be perfectly separable)');
		}

		let maxDelta = 0;
		for (let i = 0; i < size; i++) maxDelta = Math.max(maxDelta, Math.abs(betaNew[i] - beta[i]));
		beta = betaNew;

		if (!beta.every(Number.isFinite)) {
			throw new Error('Failed to train the model (the numerical computation diverged)');
		}
		if (maxDelta < opts.tolerance) {
			converged = true;
			iterations++;
			break;
		}
	}

	const intercept = beta[0];
	const coefficients = beta.slice(1);

	// Compute predicted probabilities, the confusion matrix, and likelihood-based metrics
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

/**
 * Assesses goodness of fit from McFadden's pseudo-R². Note that the scale differs from linear regression's R²
 * (McFadden (1974) considers 0.2–0.4 to be "a very good fit"; reusing linear regression's R² thresholds as-is
 * would actually underrate a genuinely good model).
 */
function assessPseudoR2(pseudoR2: number): ValidityCheckItem {
	if (pseudoR2 >= 0.4) {
		return { label: 'Goodness of fit', level: 'good', comment: `Pseudo-R² (McFadden) = ${pseudoR2.toFixed(3)}, indicating a very good fit` };
	}
	if (pseudoR2 >= 0.2) {
		return { label: 'Goodness of fit', level: 'good', comment: `Pseudo-R² (McFadden) = ${pseudoR2.toFixed(3)}, indicating a good fit (0.2–0.4 is considered good)` };
	}
	if (pseudoR2 >= 0.1) {
		return { label: 'Goodness of fit', level: 'caution', comment: `Pseudo-R² (McFadden) = ${pseudoR2.toFixed(3)}; the fit is somewhat weak, so treat it as a rough indication only` };
	}
	return { label: 'Goodness of fit', level: 'poor', comment: `Pseudo-R² (McFadden) = ${pseudoR2.toFixed(3)}; the fit is weak, and these features do not predict the outcome well` };
}

/**
 * Assesses the validity of a classification model. Checks the fit (pseudo-R²), sample size adequacy,
 * IRLS convergence, and target class balance (extreme imbalance tends to hurt prediction accuracy for the minority class).
 */
export function assessClassificationValidity(model: LogisticRegressionModel): ValidityAssessment {
	const checks: ValidityCheckItem[] = [
		assessPseudoR2(model.metrics.pseudoR2),
		assessSampleSizeAdequacy(model.metrics.sampleSize, model.featureColumns.length)
	];

	if (!model.metrics.converged) {
		checks.push({
			label: 'Training convergence',
			level: 'poor',
			comment: 'Training did not converge within the maximum number of iterations. The coefficients may be unreliable'
		});
	} else {
		checks.push({ label: 'Training convergence', level: 'good', comment: `Converged after ${model.metrics.iterations} iterations` });
	}

	const cm = model.confusionMatrix;
	const total = cm.truePositive + cm.falsePositive + cm.trueNegative + cm.falseNegative;
	const positiveRate = total > 0 ? (cm.truePositive + cm.falseNegative) / total : 0;
	const minorityRate = Math.min(positiveRate, 1 - positiveRate);
	if (minorityRate >= 0.2) {
		checks.push({ label: 'Class balance', level: 'good', comment: `The positive class rate is ${(positiveRate * 100).toFixed(1)}%, so the two classes are reasonably balanced` });
	} else if (minorityRate >= 0.05) {
		checks.push({
			label: 'Class balance',
			level: 'caution',
			comment: `The positive class rate is somewhat skewed at ${(positiveRate * 100).toFixed(1)}%. Prediction accuracy for the minority class may be low`
		});
	} else {
		checks.push({
			label: 'Class balance',
			level: 'poor',
			comment: `The positive class rate is extremely skewed at ${(positiveRate * 100).toFixed(1)}%. Even if overall accuracy looks high, the model may barely predict the minority class correctly`
		});
	}

	const { overallLevel, overallComment } = combineOverall(
		checks,
		'No issues were found on the main validity checks for this classification model'
	);
	return { overallLevel, overallComment, checks };
}

/** Pure function that computes the predicted probability (0–1, probability of the positive class) from a saved model */
export function predictLogisticRegression(model: LogisticRegressionModel, vars: Record<string, number>): number {
	let e = model.intercept;
	for (let i = 0; i < model.featureColumns.length; i++) {
		const col = model.featureColumns[i];
		const v = vars[col];
		if (typeof v !== 'number' || !Number.isFinite(v)) {
			throw new Error(`No value was provided for variable ${col}`);
		}
		e += model.coefficients[i] * v;
	}
	return sigmoid(e);
}
