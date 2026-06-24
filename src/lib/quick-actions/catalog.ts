// クイックアクション: チャット入力欄の「+」ボタンから AI を介さず直接呼び出せる MCP ツールのカタログ。
// クライアント（チャット入力欄・設定画面）と共有するため、サーバー専用の依存（DB・dispatchTool 等）は持たない。

export type QuickActionId =
	| 'get_customers'
	| 'search_deals'
	| 'get_contacts'
	| 'summarize_deals'
	| 'summarize_customers'
	| 'summarize_activities'
	| 'create_customer'
	| 'scan_bizcard'
	| 'create_reminder'
	| 'ai_briefing';

export type QuickActionDef = {
	id: QuickActionId;
	label: string;
	description: string;
	icon: string;
};

export const quickActionCatalog: QuickActionDef[] = [
	{ id: 'get_customers', label: '顧客一覧', description: '最新の顧客一覧を表示します', icon: '👥' },
	{ id: 'search_deals', label: '案件一覧', description: '最新の案件一覧を表示します', icon: '💼' },
	{ id: 'get_contacts', label: '担当者一覧', description: '最新の担当者一覧を表示します', icon: '🧑' },
	{ id: 'summarize_deals', label: '案件サマリ', description: 'ステータス別の案件件数・金額を表示します', icon: '📊' },
	{ id: 'summarize_customers', label: '顧客数サマリ', description: 'ステータス別の顧客数を表示します', icon: '📈' },
	{ id: 'summarize_activities', label: '活動サマリ', description: '種別ごとの活動件数を表示します', icon: '📝' },
	{ id: 'create_customer', label: '顧客登録', description: '顧客情報の登録フォームを表示します', icon: '➕' },
	{ id: 'scan_bizcard', label: '名刺読取', description: '名刺をスキャンして顧客・担当者を登録します', icon: '📇' },
	{ id: 'create_reminder', label: 'リマインダー設定', description: 'リマインダーの登録フォームを表示します', icon: '⏰' },
	{ id: 'ai_briefing', label: 'AIブリーフィング', description: '今日のフォロー推奨案件とリマインダーをAIが要約します', icon: '✨' }
];

export const DEFAULT_QUICK_ACTION_IDS: QuickActionId[] = [
	'get_customers',
	'search_deals',
	'summarize_deals',
	'summarize_activities'
];

export const MAX_QUICK_ACTIONS = 5;

export const QUICK_ACTIONS_STORAGE_KEY = 'quickActionIds';

export function isQuickActionId(id: string): id is QuickActionId {
	return quickActionCatalog.some((a) => a.id === id);
}
