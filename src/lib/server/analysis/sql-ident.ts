/** SQL識別子として埋め込む前にバッククォート自体をエスケープする（SQLite標準の `` `` `` 記法） */
export function quoteIdent(name: string): string {
	return `\`${name.replace(/`/g, '``')}\``;
}
