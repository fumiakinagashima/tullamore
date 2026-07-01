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
