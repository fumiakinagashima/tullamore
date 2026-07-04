import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';
import { env } from '$env/dynamic/private';

type AnalysisChatEvent =
	| { type: 'delta'; text: string }
	| { type: 'config'; config: Record<string, unknown> }
	| { type: 'done' }
	| { type: 'error'; message: string };

function sse(event: AnalysisChatEvent): string {
	return `data: ${JSON.stringify(event)}\n\n`;
}

type SourceInfo = { id: string; name: string; columns: { key: string; label: string; type: string }[] };

const SET_CONFIG_TOOL: Tool = {
	name: 'set_config',
	description:
		'分析画面の設定（データソース・列・予測期間）をセットし、画面に反映する。' +
		'ユーザーが分析したい内容を伝えてきたら、渡されているデータソース一覧から適切なデータソース・列を選んで呼び出す。' +
		'目的変数として使えるのは数値列のみ、日付列として使えるのは日付型の列のみ。' +
		'候補が複数あり判断に迷う場合や、該当しそうな列が無い場合は、ツールを呼ばずに質問で確認すること。',
	input_schema: {
		type: 'object',
		properties: {
			data_source_id: { type: 'string', description: 'データソースID' },
			target_column: { type: 'string', description: '目的変数の列キー' },
			feature_columns: {
				type: 'array',
				items: { type: 'string' },
				description: '説明変数の列キーの配列（回帰分析のみ）'
			},
			date_column: { type: 'string', description: '日付列のキー（トレンド予測のみ）' },
			horizon_months: {
				type: 'number',
				enum: [6, 12, 60],
				description: '予測期間（月数）。6=半年後まで、12=1年後まで、60=5年後まで（トレンド予測のみ）'
			},
			granularity: {
				type: 'string',
				enum: ['day', 'week', 'month'],
				description: '集計粒度（トレンド予測のみ）。day=日次、week=週次、month=月次。指定がなければmonthのまま変更しない'
			},
			total_budget: {
				type: 'number',
				description: '配分する予算の総額（予算配分最適化のみ）'
			},
			group_column: {
				type: 'string',
				description: '2グループに分ける列のキー（A/Bテストのみ。値が2種類の列を選ぶこと）'
			},
			test_type: {
				type: 'string',
				enum: ['mean', 'proportion'],
				description: '検定方法（A/Bテストのみ）。mean=平均の差のt検定（連続値の指標）、proportion=比率の差のz検定（0/1の指標）'
			}
		}
	}
};

type AnalysisType =
	| 'regression'
	| 'trend'
	| 'sensitivity'
	| 'scenario'
	| 'goal-seek'
	| 'monte-carlo'
	| 'budget-allocation'
	| 'correlation'
	| 'descriptive-stats'
	| 'ab-test'
	| 'classification'
	| null;

function buildSystemPrompt(
	analysisType: AnalysisType,
	sources: SourceInfo[],
	config: Record<string, unknown>,
	resultSummary: Record<string, unknown> | null
): string {
	const sections: string[] = ['あなたは分析画面の右側に表示されるAIアシスタントです。'];

	if (analysisType === 'regression') {
		sections.push(
			'現在の画面は「回帰分析」です。説明変数を動かすと目的変数がどう変化するかをシミュレーションする画面で、' +
				'データソース・目的変数（数値列）・説明変数（数値列、複数可）を設定すると結果が表示されます。'
		);
	} else if (analysisType === 'trend') {
		sections.push(
			'現在の画面は「トレンド予測」です。時系列データから将来の推移を線で予測する画面で、' +
				'データソース・日付列・目的変数（数値列）・予測期間（半年/1年/5年）・集計粒度（日次/週次/月次、指定なければ月次）を' +
				'設定すると結果が表示されます。結果表示後は元データのグリッドが編集可能になり、数値や日付を変更すると即座に再計算されます。'
		);
	} else if (analysisType === 'sensitivity') {
		sections.push(
			'現在の画面は「感度分析」です。回帰モデルを学習した上で、各説明変数を実測レンジいっぱいに動かした時に' +
				'目的変数がどれだけ振れるかをトルネードチャートで見る画面です。データソース・目的変数（数値列）・説明変数（数値列、複数可）を' +
				'設定すると結果が表示されます。「どの変数が一番効いているか」はチャートの振れ幅が最も大きい変数です。'
		);
	} else if (analysisType === 'scenario') {
		sections.push(
			'現在の画面は「シナリオ比較」です。回帰モデルを学習した上で、説明変数の値の組み合わせ（シナリオ）を複数用意し、' +
				'目的変数の予測値を横並びの棒グラフで比較する画面です。データソース・目的変数（数値列）・説明変数（数値列、複数可）を' +
				'設定すると結果が表示されます。シナリオごとの具体的な数値は画面下のグリッドで編集してください（このアシスタントはシナリオの値までは設定できません）。'
		);
	} else if (analysisType === 'goal-seek') {
		sections.push(
			'現在の画面は「ゴールシーク」です。回帰モデルを学習した上で、目的変数を目標値にするために' +
				'ある説明変数がいくつであるべきかを逆算する画面です。データソース・目的変数（数値列）・説明変数（数値列、複数可）を' +
				'設定すると結果が表示されます。逆算する変数・目標値・他の変数の固定値は画面上で選択・入力してください。'
		);
	} else if (analysisType === 'monte-carlo') {
		sections.push(
			'現在の画面は「モンテカルロ・シミュレーション」です。回帰モデルを学習した上で、各説明変数に分布（一様/正規/三角/固定値）を' +
				'与えて大量にサンプリングし、目的変数がとりうる値のばらつき（平均・標準偏差・パーセンタイル・ヒストグラム）を見る画面です。' +
				'データソース・目的変数（数値列）・説明変数（数値列、複数可）を設定すると結果が表示されます。' +
				'各変数の分布の種類・パラメータ、サンプル数、閾値はこのアシスタントでは設定できないため画面上で入力するよう案内してください。'
		);
	} else if (analysisType === 'budget-allocation') {
		sections.push(
			'現在の画面は「予算配分最適化（マーケティングミックス）」です。回帰モデルを学習した上で、' +
				'説明変数を予算配分するチャネル（広告費等）とみなし、指定した予算総額を各チャネルの上下限（既定は実測レンジ）内で' +
				'目的変数（例: 売上）が最大になるよう配分する画面です。データソース・目的変数（数値列）・チャネル（説明変数、数値列、複数可）を' +
				'設定すると結果が表示されます。予算総額（total_budget）が伝えられればそれも設定すること。チャネルごとの上下限は画面上で調整してください。'
		);
	} else if (analysisType === 'correlation') {
		sections.push(
			'現在の画面は「相関分析」です。選択した列どうしのピアソン相関係数を計算し、ヒートマップで表示する画面です。' +
				'データソースと相関を見たい列（数値列、feature_columnsに2つ以上）を設定すると結果が表示されます。' +
				'目的変数の概念はなく、選んだ列どうしの全ペアの相関を対称行列で見る点が回帰分析等と異なります。'
		);
	} else if (analysisType === 'descriptive-stats') {
		sections.push(
			'現在の画面は「記述統計」です。選択した列それぞれについて件数・平均・中央値・標準偏差・最小/最大・四分位数と' +
				'ヒストグラムを表示する画面です。データソースと統計を見たい列（数値列、feature_columnsに1つ以上）を設定すると結果が表示されます。' +
				'目的変数の概念はなく、選んだ列それぞれを独立に要約する点が回帰分析等と異なります。'
		);
	} else if (analysisType === 'ab-test') {
		sections.push(
			'現在の画面は「A/Bテスト・有意差検定」です。2つのグループ間で指標に統計的な有意差があるかを検定する画面です。' +
				'データソース・グループ列（group_column、値が2種類である列。例: 施策A/施策B）・指標列（target_column、数値列）・' +
				'検定方法（test_type。連続値の指標=mean=t検定、0/1の指標=proportion=z検定）を設定すると結果が表示されます。' +
				'p値が0.05未満なら統計的に有意な差があると判断します。'
		);
	} else if (analysisType === 'classification') {
		sections.push(
			'現在の画面は「ロジスティック回帰・分類」です。目的変数が2値（購入した/しない、解約した/しない等）の場合に、' +
				'説明変数からその確率を予測するモデルを作る画面です。データソース・目的変数（2値の列、target_column）・' +
				'説明変数（数値列、複数可、feature_columns）を設定すると結果が表示されます。' +
				'正解率・適合率・再現率・混同行列・オッズ比が表示されます。回帰分析（連続値の予測）との違いは目的変数が2値である点です。'
		);
	} else {
		sections.push(
			'ユーザーはまだ分析画面（回帰分析・感度分析・シナリオ比較・ゴールシーク・トレンド予測・モンテカルロ・シミュレーション・' +
				'予算配分最適化・相関分析・記述統計・A/Bテスト・ロジスティック回帰のいずれか）を開いていません。' +
				'何を分析したいか聞き、適した画面をサイドバーから開くよう案内してください（このアシスタントは開いた画面の設定を手伝えます）。'
		);
	}

	if (sources.length > 0) {
		const sourceList = sources
			.map((s) => {
				const cols = s.columns.map((c) => `${c.label}（key: ${c.key}, type: ${c.type}）`).join(', ');
				return `- 「${s.name}」（id: ${s.id}）: ${cols}`;
			})
			.join('\n');
		sections.push(`利用可能なデータソース:\n${sourceList}`);
	} else {
		sections.push('現在、利用可能なデータソースがありません。先に /database でデータソースを作成するよう案内してください。');
	}

	if (Object.keys(config).length > 0) {
		sections.push(`現在の設定値:\n${JSON.stringify(config, null, 2)}`);
	}

	if (resultSummary) {
		sections.push(
			`現在の分析結果（妥当性について聞かれたらこれを元に答える。決定係数R²は1に近いほど当てはまりが良い）:\n${JSON.stringify(resultSummary, null, 2)}`
		);
	}

	sections.push(
		'ユーザーが分析したい内容を伝えてきたら set_config ツールで設定を反映すること。' +
			'使い方の質問には簡潔に答えること。回答は簡潔にすること。'
	);

	return sections.join('\n\n');
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const mockMode = platform?.env?.MOCK_AI === 'true' || env.MOCK_AI === 'true';

	const body = (await request.json()) as {
		message: string;
		analysisType: AnalysisType;
		sources: SourceInfo[];
		config: Record<string, unknown>;
		resultSummary: Record<string, unknown> | null;
		history: { role: 'user' | 'assistant'; text: string }[];
	};

	if (mockMode) {
		const stream = new ReadableStream({
			async start(controller) {
				const enqueue = (e: AnalysisChatEvent) => controller.enqueue(new TextEncoder().encode(sse(e)));
				await new Promise((r) => setTimeout(r, 300));
				for (const char of 'ご質問ありがとうございます。') {
					enqueue({ type: 'delta', text: char });
					await new Promise((r) => setTimeout(r, 20));
				}
				enqueue({ type: 'done' });
				controller.close();
			}
		});
		return new Response(stream, {
			headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
		});
	}

	const apiKey = platform?.env?.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY ?? '';
	if (!apiKey) {
		return new Response(sse({ type: 'error', message: 'ANTHROPIC_API_KEY not set' }), {
			headers: { 'Content-Type': 'text/event-stream' }
		});
	}

	const systemPrompt = buildSystemPrompt(body.analysisType, body.sources, body.config, body.resultSummary);
	const messages: MessageParam[] = [
		...body.history.map((m) => ({ role: m.role, content: m.text })),
		{ role: 'user', content: body.message }
	];

	const anthropic = new Anthropic({ apiKey });

	const stream = new ReadableStream({
		async start(controller) {
			const enqueue = (e: AnalysisChatEvent) => controller.enqueue(new TextEncoder().encode(sse(e)));
			try {
				const claudeStream = anthropic.messages.stream({
					model: 'claude-haiku-4-5-20251001',
					max_tokens: 1024,
					system: systemPrompt,
					tools: [SET_CONFIG_TOOL],
					messages
				});

				let currentTool: { name: string; inputJson: string } | null = null;
				const toolBlocks: { name: string; inputJson: string }[] = [];

				for await (const event of claudeStream) {
					if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
						currentTool = { name: event.content_block.name, inputJson: '' };
					} else if (event.type === 'content_block_delta') {
						if (event.delta.type === 'text_delta') {
							enqueue({ type: 'delta', text: event.delta.text });
						} else if (event.delta.type === 'input_json_delta' && currentTool) {
							currentTool.inputJson += event.delta.partial_json;
						}
					} else if (event.type === 'content_block_stop' && currentTool) {
						toolBlocks.push(currentTool);
						currentTool = null;
					}
				}

				for (const tool of toolBlocks) {
					if (tool.name !== 'set_config') continue;
					try {
						const config = JSON.parse(tool.inputJson || '{}');
						enqueue({ type: 'config', config });
					} catch {
						// malformed tool input JSON。無視してテキスト応答のみ届ける
					}
				}

				enqueue({ type: 'done' });
			} catch (e) {
				enqueue({ type: 'error', message: e instanceof Error ? e.message : String(e) });
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
	});
};
