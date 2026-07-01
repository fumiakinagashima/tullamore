import { inferAnalysisColumnType } from '$lib/analysis/column-type';
import type { AnalysisMethod } from '$lib/analysis/types';
import { parseSchema } from '../db/data-source-service';
import type { DataSource } from '../db/schema';

export type MethodSelectionResult = {
	method: AnalysisMethod | null;
	reason: string;
};

/**
 * 目的変数の性質から分析手法を判別する。現時点で対応しているのは重回帰（線形結合）のみ
 * （src/lib/analysis/registry.ts の AnalysisMethod レジストリ）。分類・時系列予測等を
 * 追加する場合はここに判定ロジックを足す。
 */
export function selectAnalysisMethod(dataSource: DataSource, targetColumn: string): MethodSelectionResult {
	const columns = parseSchema(dataSource.schemaJson);
	const target = columns.find((c) => c.key === targetColumn);
	if (!target) {
		return { method: null, reason: `"${targetColumn}" はデータソースに存在しません` };
	}

	const type = inferAnalysisColumnType(target);
	if (type !== 'continuous') {
		return {
			method: null,
			reason: `目的変数 "${targetColumn}" が数値の連続値ではありません（現時点では対応する分析手法がありません。将来的にカテゴリ変数には分類手法での対応を検討）`
		};
	}

	return {
		method: 'linear_regression',
		reason: '目的変数が連続値の数値のため、重回帰分析（線形結合）が使えます。現時点で対応している分析手法は重回帰のみです'
	};
}
