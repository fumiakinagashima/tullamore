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
	classification: 'ロジスティック回帰・分類',
	'kpi-planning': 'KPI設定'
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

async function callClaude(apiKey: string, systemPrompt: string, userMessage: string, model: string): Promise<string> {
	const anthropic = new Anthropic({ apiKey, timeout: 30000 });
	const response = await anthropic.messages.create({
		model,
		max_tokens: 2048,
		system: systemPrompt,
		messages: [{ role: 'user', content: userMessage }]
	});
	const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
	if (!text) throw new Error('レポートの生成に失敗しました。');
	return text;
}

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

	return callClaude(apiKey, SYSTEM_PROMPT, userMessage, model);
}

const COMPOSITE_SYSTEM_PROMPT = `あなたはデータ分析の結果をビジネス向けのレポートにまとめるアシスタントです。
今回は複数の異なる分析手法を同じデータに対して実行した結果を統合したレポートを作成します。
渡された各分析（analysisType・config・resultSummary。妥当性チェックの結果を含む）だけを根拠にしてください。含まれていない数値を創作してはいけません。

**重要な注意点**:
- 複数の分析結果を単一の「合成スコア」や「統合された確信度」にまとめてはいけません（p値の単純な平均・合成は統計的に不正です）。各分析の結果はそれぞれ独立したものとして扱ってください。
- 手法をまたいで結論が一致しているか、矛盾していないかを解釈し、一致していれば結論の信頼性が高まることを、矛盾していればどちらか一方を鵜呑みにせず追加の確認が必要であることを説明してください。
- 複数の検定・分析を同時に行うと、偶然どれかが有意な結果を示す確率が上がる「多重比較問題」があることに触れ、過度に断定的な結論にしないよう注意すること。

出力はMarkdown形式で、必ず以下の構成に従ってください:

# （分析内容が一目でわかる具体的なレポートタイトル）

## 概要
1〜2文でどのデータに対してどんな分析を組み合わせたかを説明する

## 各分析の結果
分析ごとに小見出しを立て、それぞれの主な発見と妥当性チェックの結果を具体的な数値とともに述べる

## 総合的な解釈
手法間で結論が一致しているか矛盾しているかを解釈する。多重比較問題への言及を含めること。単一の合成スコアは出さないこと。

## 推奨される次のアクション
分析結果を踏まえて次に何をすべきかを1〜3個、簡潔に提案する

日本語で、簡潔かつビジネス文書として自然な文体で書くこと。見出し以外の余計な前置き・後書きは書かないこと。`;

export async function generateCompositeAnalysisReport(
	apiKey: string,
	analyses: AnalysisReportInput[],
	model = 'claude-haiku-4-5-20251001'
): Promise<string> {
	const userMessage = analyses
		.map((a, i) => {
			const label = ANALYSIS_TYPE_LABELS[a.analysisType] ?? a.analysisType;
			return [
				`--- 分析${i + 1}: ${label} ---`,
				'設定:',
				JSON.stringify(a.config, null, 2),
				'結果:',
				JSON.stringify(a.resultSummary, null, 2)
			].join('\n');
		})
		.join('\n\n');

	return callClaude(apiKey, COMPOSITE_SYSTEM_PROMPT, userMessage, model);
}
