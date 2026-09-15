// Judging "can this be used directly in a regression" purely from data_sources' column type
// (text/number/date/boolean) is too coarse, so we add a column-name heuristic on top to build an
// analysis-oriented classification (used by the Phase 2 variable-design AI to judge exclusion candidates).
//
// Do not import the ColumnDef type directly from server/db: this file is an isomorphic module also meant
// to be imported from the client (the Phase 4 simulator UI), and importing a module under server/ would be
// rejected by SvelteKit's build, so we define a minimal structurally-compatible type here instead
// (data-source-service.ts's ColumnDef structurally satisfies this type).
export type AnalysisColumnType = 'continuous' | 'categorical' | 'date' | 'id';

type ColumnDef = {
	key: string;
	label: string;
	type: 'text' | 'number' | 'date' | 'boolean';
};

// Japanese ID suffixes have no word boundary, so we just match the tail; English is only allowed at the
// start of the string or right after a separator, to avoid false positives
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
	// text / boolean are currently treated as categorical variables (support for one-hot encoding etc. is out of scope; to be considered in Phase 2)
	if (looksLikeId(column.key)) return 'id';
	return 'categorical';
}

/** Extracts only the columns (continuous numeric columns) usable as target/feature variables for the MVP (linear combination only) */
export function continuousColumns(columns: ColumnDef[]): ColumnDef[] {
	return columns.filter((c) => inferAnalysisColumnType(c) === 'continuous');
}
