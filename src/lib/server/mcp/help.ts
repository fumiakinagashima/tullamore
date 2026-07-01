import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';

export const tools: Tool[] = [
	{
		name: 'get_help',
		description:
			'使い方・機能説明を取得する。ユーザーが「使い方を教えて」「何ができる？」「ヘルプ」「〇〇機能の使い方は？」などと聞いた時に呼び出す。topic を省略すると全体概要を返す',
		input_schema: {
			type: 'object',
			properties: {
				topic: {
					type: 'string',
					enum: ['overview', 'data_sources', 'analysis', 'simulator', 'email'],
					description: '知りたいトピック（省略時は全体概要）'
				}
			}
		}
	}
];

const getHelpInputSchema = z.object({
	topic: z.enum(['overview', 'data_sources', 'analysis', 'simulator', 'email']).optional()
});

const HELP: Record<string, object> = {
	overview: {
		title: 'TULLAMORE 使い方ガイド',
		description: 'チャットでデータについて質問するだけで、SQLを自動生成してグラフや表で可視化するAIネイティブなDI（意思決定インテリジェンス）システムです',
		features: [
			{ name: 'データソース管理', topic: 'data_sources', examples: ['CSVをインポートして登録したい', '新しいデータソースを作りたい'] },
			{ name: 'データ分析・可視化', topic: 'analysis', examples: ['過去1年の売上トレンドを見せて', '地域別の件数をグラフにして', '月次の推移を折れ線グラフで'] },
			{ name: 'シミュレーター作成', topic: 'simulator', examples: ['広告費から売上を予測するシミュレーターを作って'] },
			{ name: 'メール送信', topic: 'email', examples: ['レポートをメールで送って'] }
		],
		tips: [
			'自然な日本語で質問するだけでSQLが自動生成されます',
			'データソースはサイドメニューの「データソース」から登録・管理できます',
			'各データソースのテーブル名と列名はAIが自動的に把握して分析に使います'
		],
		relatedPages: [
			{ label: 'データソース', href: '/data', description: 'データの登録・CSV取り込みができます' },
			{ label: 'シミュレーター', href: '/simulators', description: '作成済みシミュレーターの一覧・操作' },
			{ label: '設定', href: '/settings', description: 'アプリの各種設定を変更できます' }
		]
	},
	data_sources: {
		title: 'データソース管理',
		description: '分析対象のデータを登録・管理します。CSVインポート、ノーコードUI、直接SQL実行に対応しています',
		operations: [
			{ action: 'データソースを新規作成する', examples: ['「データソース」ページで「新規作成」から列定義を入力します'] },
			{ action: 'CSVをインポートする', examples: ['データソース詳細ページの「CSVインポート」セクションからアップロードします'] },
			{ action: 'SQLを直接実行する', examples: ['データソース詳細ページの「SQLエディタ」でSELECT文を実行できます'] }
		],
		tips: [
			'CSVの1行目はヘッダー行として読み込まれます（カラムキーと一致させてください）',
			'テーブル名は自動生成されます（例: ds_xxxxxxxx）',
			'AIはデータソース名・説明・列のラベルを参照して分析を行います'
		],
		relatedPages: [
			{ label: 'データソース', href: '/data', description: 'データソースの一覧・登録・CSV取り込み' }
		]
	},
	analysis: {
		title: 'データ分析・可視化',
		description: 'チャットで質問するだけでSQLが生成され、グラフや表として結果が表示されます',
		operations: [
			{ action: 'トレンド分析', examples: ['過去1年の月別売上推移を見せて', '前年比でどう変わった？'] },
			{ action: 'ランキング・集計', examples: ['売上トップ10の地域は？', 'カテゴリ別の件数をまとめて'] },
			{ action: '予測・統計', examples: ['来月の売上予測をして', '外れ値はある？'] },
			{ action: 'グラフ指定', examples: ['棒グラフで見せて', '円グラフにして', '折れ線グラフで推移を表示して'] }
		],
		tips: [
			'AIがSQL生成→D1実行→グラフ表示を自動的に行います',
			'複数のデータソースを組み合わせた分析も可能です（JOINなど）',
			'「〇〇のデータはどんな列がある？」と聞くとスキーマ確認ができます'
		]
	},
	simulator: {
		title: 'シミュレーター作成',
		description: 'データから回帰モデル（シミュレーター）を生成し、変数を動かして将来のシナリオを試せます（Tullamoreの中核機能）',
		operations: [
			{ action: 'シミュレーターを作成する', examples: ['広告費と来店数から売上を予測するシミュレーターを作って', '〇〇が変わったらどうなるか試したい'] },
			{ action: '既存のシミュレーターを確認する', examples: ['作成済みのシミュレーターを見せて'] },
			{ action: 'シナリオを比較する', examples: ['広告費を50万円にしたら？', '楽観的なケースと悲観的なケースを比較して'] }
		],
		tips: [
			'AIが目的変数・説明変数の候補を提案してから生成します（design_variables）',
			'生成後は自動でAIレビュー（当てはまり・サンプル数・多重共線性のチェック）を行います',
			'現時点で対応している分析手法は重回帰（線形結合）のみです',
			'決定係数（R²）が低い場合は、別の説明変数を試すか結果を参考程度に留めてください',
			'作成したシミュレーターは「シミュレーター」ページ（サイドメニュー）からスライダー操作で試せます。詳細ページでは左側のAIアシスタントに変数や係数について質問できます'
		],
		relatedPages: [
			{ label: 'シミュレーター', href: '/simulators', description: '作成済みシミュレーターの一覧・操作' }
		]
	},
	email: {
		title: 'メール送信',
		operations: [
			{ action: 'メールを作成・送信する', examples: ['〇〇さんにメールを送って', '分析結果をメールで共有して'] }
		],
		tips: [
			'AIが下書きを作成し、フォームで内容を確認・編集してから送信します',
			'初回利用時はメール設定画面でメールサービスの設定が必要です'
		],
		relatedPages: [
			{ label: 'メール設定', href: '/settings/email', description: 'メール送信サービスの設定ができます' }
		]
	}
};

export function handleGetHelp(input: unknown) {
	const { topic } = getHelpInputSchema.parse(input ?? {});
	return HELP[topic ?? 'overview'];
}
