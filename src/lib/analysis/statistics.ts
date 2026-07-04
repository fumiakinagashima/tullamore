// A/Bテスト（有意差検定）で使う基礎的な確率分布計算。
// pure-JSの統計ライブラリを新規依存として増やすほどの利用範囲ではないため、
// 標準的な数値計算のアルゴリズム（Numerical Recipes由来のincomplete beta関数等）を自前実装する。

/** 誤差関数 erf(x)。Abramowitz & Stegun 7.1.26（最大誤差 約1.5e-7） */
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

/** 標準正規分布の累積分布関数 P(Z <= z) */
export function normalCDF(z: number): number {
	return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** 対数ガンマ関数 ln(Γ(x))（Lanczos近似） */
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

/** 正則化不完全ベータ関数 I_x(a,b) の連分数展開（Numerical Recipes "betacf"） */
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

/** 正則化不完全ベータ関数 I_x(a,b) */
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

/** 自由度dfのStudentのt分布の累積分布関数 P(T <= t) */
export function studentTCDF(t: number, df: number): number {
	const x = df / (df + t * t);
	const ib = regularizedIncompleteBeta(x, df / 2, 0.5);
	return t > 0 ? 1 - ib / 2 : ib / 2;
}

/**
 * StudentのT分布のパーセント点関数（累積確率pに対応するt値）。解析的な逆関数が無いため、
 * 単調増加であるstudentTCDFに対する二分探索で求める（信頼区間の臨界値を得るために使う）。
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

/** 両側検定のp値（t統計量・自由度から） */
export function twoTailedPValueFromT(t: number, df: number): number {
	const p = 2 * (1 - studentTCDF(Math.abs(t), df));
	return Math.min(1, Math.max(0, p));
}

/** 両側検定のp値（z統計量から、標準正規分布） */
export function twoTailedPValueFromZ(z: number): number {
	const p = 2 * (1 - normalCDF(Math.abs(z)));
	return Math.min(1, Math.max(0, p));
}

/** 標準正規分布のパーセント点関数（近似）。95%信頼区間の1.959964...等を得るために使う */
export function normalInverseCDF(p: number): number {
	// Acklam's algorithm（有理近似、絶対誤差 約1.15e-9）
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
