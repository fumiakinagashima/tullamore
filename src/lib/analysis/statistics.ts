// Basic probability distribution calculations used for A/B testing (significance tests).
// The scope of usage doesn't justify adding a pure-JS statistics library as a new dependency,
// so we implement standard numerical algorithms ourselves (e.g., the incomplete beta function from Numerical Recipes).

/** Error function erf(x). Abramowitz & Stegun 7.1.26 (max error ~1.5e-7) */
export function erf(x: number): number {
	const sign = x < 0 ? -1 : 1;
	const ax = Math.abs(x);

	const a1 = 0.254829592;
	const a2 = -0.284496736;
	const a3 = 1.421413741;
	const a4 = -1.453152027;
	const a5 = 1.061405429;
	const p = 0.3275911;

	const t = 1 / (1 + p * ax);
	const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
	return sign * y;
}

/** Cumulative distribution function of the standard normal distribution, P(Z <= z) */
export function normalCDF(z: number): number {
	return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Log-gamma function ln(Γ(x)) (Lanczos approximation) */
function logGamma(x: number): number {
	const g = 7;
	const coefficients = [
		0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
		12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
	];
	if (x < 0.5) {
		return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
	}
	const xx = x - 1;
	let a = coefficients[0];
	const t = xx + g + 0.5;
	for (let i = 1; i < g + 2; i++) a += coefficients[i] / (xx + i);
	return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued-fraction expansion of the regularized incomplete beta function I_x(a,b) (Numerical Recipes "betacf") */
function betacf(x: number, a: number, b: number): number {
	const MAXIT = 200;
	const EPS = 3e-9;
	const FPMIN = 1e-300;

	const qab = a + b;
	const qap = a + 1;
	const qam = a - 1;
	let c = 1;
	let d = 1 - (qab * x) / qap;
	if (Math.abs(d) < FPMIN) d = FPMIN;
	d = 1 / d;
	let h = d;

	for (let m = 1; m <= MAXIT; m++) {
		const m2 = 2 * m;
		let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < FPMIN) d = FPMIN;
		c = 1 + aa / c;
		if (Math.abs(c) < FPMIN) c = FPMIN;
		d = 1 / d;
		h *= d * c;

		aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < FPMIN) d = FPMIN;
		c = 1 + aa / c;
		if (Math.abs(c) < FPMIN) c = FPMIN;
		d = 1 / d;
		const del = d * c;
		h *= del;

		if (Math.abs(del - 1) < EPS) break;
	}
	return h;
}

/** Regularized incomplete beta function I_x(a,b) */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
	if (x <= 0) return 0;
	if (x >= 1) return 1;
	const logBeta = logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
	const front = Math.exp(logBeta);
	if (x < (a + 1) / (a + b + 2)) {
		return (front * betacf(x, a, b)) / a;
	}
	return 1 - (front * betacf(1 - x, b, a)) / b;
}

/** Cumulative distribution function of Student's t-distribution with df degrees of freedom, P(T <= t) */
export function studentTCDF(t: number, df: number): number {
	const x = df / (df + t * t);
	const ib = regularizedIncompleteBeta(x, df / 2, 0.5);
	return t > 0 ? 1 - ib / 2 : ib / 2;
}

/**
 * Percent-point function of Student's t-distribution (the t value corresponding to a cumulative
 * probability p). Since there's no closed-form inverse, it's found via binary search against the
 * monotonically increasing studentTCDF (used to obtain critical values for confidence intervals).
 */
export function studentTInverseCDF(p: number, df: number): number {
	if (p <= 0) return -Infinity;
	if (p >= 1) return Infinity;
	if (p === 0.5) return 0;

	let lo = -2000;
	let hi = 2000;
	for (let i = 0; i < 100; i++) {
		const mid = (lo + hi) / 2;
		if (studentTCDF(mid, df) < p) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

/** Two-tailed p-value (from a t-statistic and degrees of freedom) */
export function twoTailedPValueFromT(t: number, df: number): number {
	const p = 2 * (1 - studentTCDF(Math.abs(t), df));
	return Math.min(1, Math.max(0, p));
}

/** Two-tailed p-value (from a z-statistic, standard normal distribution) */
export function twoTailedPValueFromZ(z: number): number {
	const p = 2 * (1 - normalCDF(Math.abs(z)));
	return Math.min(1, Math.max(0, p));
}

/** Percent-point function of the standard normal distribution (approximation). Used to obtain values like 1.959964... for a 95% confidence interval */
export function normalInverseCDF(p: number): number {
	// Acklam's algorithm (rational approximation, absolute error ~1.15e-9)
	const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
	const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
	const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
	const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
	const pLow = 0.02425;

	if (p <= 0) return -Infinity;
	if (p >= 1) return Infinity;

	if (p < pLow) {
		const q = Math.sqrt(-2 * Math.log(p));
		return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
	}
	if (p <= 1 - pLow) {
		const q = p - 0.5;
		const r = q * q;
		return (
			(((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
			(((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
		);
	}
	const q = Math.sqrt(-2 * Math.log(1 - p));
	return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
