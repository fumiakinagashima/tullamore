// ── Polling ────────────────────────────────────────────────────────────────
export const NOTIFICATION_POLL_INTERVAL_MS = 15000;

// ── Chat ───────────────────────────────────────────────────────────────────
export const CHAT_TITLE_MAX_LENGTH = 24;
export const CHAT_TEXTAREA_MAX_HEIGHT_PX = 192;

// ── Lists ──────────────────────────────────────────────────────────────────
// 一覧表示の1ページあたり件数（チャットの Table・/database 一覧で共通）
export const LIST_PAGE_SIZE = 20;

// ── Session / KV ──────────────────────────────────────────────────────────
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const DOCUMENT_JOB_TTL_SECONDS = 3600;

// ── Rate limits ───────────────────────────────────────────────────────────
export const FORGOT_PASSWORD_RATE_LIMIT = 5;
export const FORGOT_PASSWORD_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ── DB query limits ───────────────────────────────────────────────────────
export const DEFAULT_LIST_LIMIT = 50;

// ── Analysis: Monte Carlo ────────────────────────────────────────────────
export const MONTE_CARLO_MIN_SAMPLES = 1000;
export const MONTE_CARLO_MAX_SAMPLES = 10000;
export const MONTE_CARLO_DEFAULT_SAMPLES = 5000;
export const MONTE_CARLO_HISTOGRAM_BINS = 20;
export const MONTE_CARLO_PERCENTILES = [10, 25, 50, 75, 90];

// ── Analysis: Budget allocation ──────────────────────────────────────────
export const BUDGET_ALLOCATION_COEF_EPSILON = 1e-9;

// ── Analysis: Descriptive statistics ─────────────────────────────────────
// n/mean/stddev/min/maxはSQL集計で正確に計算するが、中央値・四分位数・ヒストグラムは
// 生データが必要なため、このサンプル件数を上限にフェッチする（超える場合は非復元抽出的な
// 先頭N件のサンプルとして扱う。詳細はsrc/lib/server/analysis/descriptive-stats.tsを参照）
export const DESCRIPTIVE_STATS_SAMPLE_MAX_ROWS = 50000;
export const DESCRIPTIVE_STATS_HISTOGRAM_BINS = 20;

// ── Analysis: A/B test ────────────────────────────────────────────────────
export const AB_TEST_SIGNIFICANCE_ALPHA = 0.05;

// ── Analysis: Classification (logistic regression) ───────────────────────
// ロジスティック回帰はOLSと異なりサマリー統計量に還元できず（IRLSの反復ごとに重みが変わるため）、
// 生の行データが必要。Workers CPU時間を守るためフェッチする行数の上限
export const LOGISTIC_REGRESSION_MAX_ROWS = 20000;
export const LOGISTIC_REGRESSION_MAX_ITERATIONS = 50;
export const LOGISTIC_REGRESSION_CONVERGENCE_TOLERANCE = 1e-6;
