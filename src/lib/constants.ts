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
