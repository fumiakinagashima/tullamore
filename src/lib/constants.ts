// ── Polling ────────────────────────────────────────────────────────────────
export const NOTIFICATION_POLL_INTERVAL_MS = 15000;
// Reload interval used on /database/[id] to check progress while external_table_syncs is still being ingested via Queue (syncing)
export const INGEST_SYNC_POLL_INTERVAL_MS = 5000;

// ── Chat ───────────────────────────────────────────────────────────────────
export const CHAT_TITLE_MAX_LENGTH = 24;
export const CHAT_TEXTAREA_MAX_HEIGHT_PX = 192;

// ── Lists ──────────────────────────────────────────────────────────────────
// Items per page for list views (shared by the chat Table and the /database list)
export const LIST_PAGE_SIZE = 20;

// ── Session / KV ──────────────────────────────────────────────────────────
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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
// n/mean/stddev/min/max are computed exactly via SQL aggregation, but the median, quartiles,
// and histogram need the raw data, so fetching is capped at this sample size (rows beyond that
// are treated as a non-resampled sample of the first N rows; see src/lib/server/analysis/descriptive-stats.ts)
export const DESCRIPTIVE_STATS_SAMPLE_MAX_ROWS = 50000;
export const DESCRIPTIVE_STATS_HISTOGRAM_BINS = 20;

// ── Analysis: A/B test ────────────────────────────────────────────────────
export const AB_TEST_SIGNIFICANCE_ALPHA = 0.05;

// ── Analysis: Classification (logistic regression) ───────────────────────
// Unlike OLS, logistic regression cannot be reduced to summary statistics (weights change on
// every IRLS iteration), so it needs raw row data. Cap on rows fetched to protect Workers CPU time
export const LOGISTIC_REGRESSION_MAX_ROWS = 20000;
export const LOGISTIC_REGRESSION_MAX_ITERATIONS = 50;
export const LOGISTIC_REGRESSION_CONVERGENCE_TOLERANCE = 1e-6;
