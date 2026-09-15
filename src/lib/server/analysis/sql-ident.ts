/** Escapes backticks before embedding a name as a SQL identifier (SQLite's standard `` `` `` notation) */
export function quoteIdent(name: string): string {
	return `\`${name.replace(/`/g, '``')}\``;
}
