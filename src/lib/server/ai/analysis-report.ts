import Anthropic from '@anthropic-ai/sdk';

export type AnalysisReportInput = {
	analysisType: string;
	config: Record<string, unknown>;
	resultSummary: Record<string, unknown>;
};

const ANALYSIS_TYPE_LABELS: Record<string, string> = {
	regression: '回帰分析',
	sensitivity: '感度分析',
	scenario: 'シナリオ比較',
	'goal-seek': 'ゴールシーク',
	trend: 'トレンド予測',
	'monte-carlo': 'モンテカルロ・シミュレーション',
	'budget-allocation': '予算配分最適化',
	correlation: '相関分析',
	'descriptive-stats': '記述統計',
	'ab-test': 'A/Bテスト・有意差検定',
	classification: 'ロジスティック回帰・分類'
};

const SYSTEM_PROMPT = `あなたはデータ分析の結果をビジネス向けのレポートにまとめるアシスタントです。
渡された分析設定（config）と分析結果（resultSummary。妥当性チェックの結果を含む）だけを根拠にレポートを作成してください。
resultSummaryに含まれていない数値を創作してはいけません。

出力はMarkdown形式で、必ず以下の構成に従ってください:

# （分析内容が一目でわかる具体的なレポートタイトル）

## 概要
1〜2文で何を分析したかを説明する

## 主な発見
箇条書きで、結果から読み取れる具体的な事実を述べる（resultSummaryの数値を引用すること）

## 統計的な妥当性
resultSummaryのvalidity（overall・comment）やR²・p値・サンプル数などの指標を具体的に引用しながら、
「この分析結果は◯◯の値が◯◯になっていることから妥当と判断できます」のように妥当性を説明する。
懸念点がある場合（validityがcaution/poorの場合等）は必ず明確に指摘する。

## 推奨される次のアクション
分析結果を踏まえて次に何をすべきかを1〜3個、簡潔に提案する

日本語で、簡潔かつビジネス文書として自然な文体で書くこと。見出し以外の余計な前置き・後書きは書かないこと。`;

export async function generateAnalysisReport(
	apiKey: string,
	input: AnalysisReportInput,
	model = 'claude-haiku-4-5-20251001'
): Promise<string> {
	const label = ANALYSIS_TYPE_LABELS[input.analysisType] ?? input.analysisType;
	const userMessage = [
		`分析手法: ${label}`,
		'',
		'設定:',
		JSON.stringify(input.config, null, 2),
		'',
		'結果:',
		JSON.stringify(input.resultSummary, null, 2)
	].join('\n');

	const anthropic = new Anthropic({ apiKey, timeout: 30000 });
	const response = await anthropic.messages.create({
		model,
		max_tokens: 2048,
		system: SYSTEM_PROMPT,
		messages: [{ role: 'user', content: userMessage }]
	});
	const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
	if (!text) throw new Error('レポートの生成に失敗しました。');
	return text;
}
