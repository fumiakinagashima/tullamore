export type QuickActionId = 'list_data_sources' | 'create_reminder';

export type QuickActionDef = {
	id: QuickActionId;
	label: string;
	description: string;
	icon: string;
};

export const quickActionCatalog: QuickActionDef[] = [
	{
		id: 'list_data_sources',
		label: 'データソース一覧',
		description: '登録済みのデータソースを一覧表示',
		icon: '📊'
	},
	{
		id: 'create_reminder',
		label: 'リマインダー設定',
		description: 'リマインダーの登録フォームを表示します',
		icon: '⏰'
	}
];

export const DEFAULT_QUICK_ACTION_IDS: QuickActionId[] = ['list_data_sources'];
export const MAX_QUICK_ACTIONS = 5;
export const QUICK_ACTIONS_STORAGE_KEY = 'tullamore_quick_actions';

export function isQuickActionId(id: string): id is QuickActionId {
	return quickActionCatalog.some((a) => a.id === id);
}
