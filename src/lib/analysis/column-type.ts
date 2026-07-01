// data_sources のカラム型（text/number/date/boolean）だけでは「回帰分析にそのまま使えるか」の判定が粗いため、
// 列名のヒューリスティックを加えた分析用の分類を用意する（Phase 2の変数設計AIが除外候補の判定に使う）。
//
// ColumnDef の型を server/db から直接importしない: このファイルは client (Phase 4のシミュレーターUI) からも
// importされる想定のisomorphicなモジュールで、server/配下のモジュールをimportするとSvelteKitのビルドで弾かれるため、
// 構造的に互換な最小限の型をここで定義する（data-source-service.ts の ColumnDef は構造的にこの型を満たす）。
export type AnalysisColumnType = 'continuous' | 'categorical' | 'date' | 'id';

type ColumnDef = {
	key: string;
	label: string;
	type: 'text' | 'number' | 'date' | 'boolean';
};

// 日本語のID接尾辞は語境界がないため単純な後方一致で、英語は誤検出を避けるため語頭 or 区切り文字の後だけ許可する
const ID_SUFFIX_JA = /(番号|コード)$/;
const ID_SUFFIX_EN = /(^|[_-])(id|no|code)$/i;

function looksLikeId(key: string): boolean {
	return ID_SUFFIX_JA.test(key) || ID_SUFFIX_EN.test(key);
}

export function inferAnalysisColumnType(column: ColumnDef): AnalysisColumnType {
	if (column.type === 'date') return 'date';
	if (column.type === 'number') {
		return looksLikeId(column.key) ? 'id' : 'continuous';
	}
	// text / boolean は現状カテゴリ変数として扱う（one-hotエンコード等の対応はスコープ外、Phase 2で検討）
	if (looksLikeId(column.key)) return 'id';
	return 'categorical';
}

/** MVP（線形結合のみ）の目的変数・説明変数として使える列（連続値の数値列）だけを抽出する */
export function continuousColumns(columns: ColumnDef[]): ColumnDef[] {
	return columns.filter((c) => inferAnalysisColumnType(c) === 'continuous');
}
