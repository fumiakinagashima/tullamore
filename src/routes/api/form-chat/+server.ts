import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { env } from '$env/dynamic/private';
import type { StreamEvent } from '$lib/server/ai/stream';

function sse(event: StreamEvent): string {
	return `data: ${JSON.stringify(event)}\n\n`;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const mockMode = platform?.env?.MOCK_AI === 'true' || env.MOCK_AI === 'true';

	const body = (await request.json()) as {
		message: string;
		formTitle: string;
		formFields: { key: string; label: string }[];
		history: { role: 'user' | 'assistant'; text: string }[];
		// ダイアログに表示中のレコード（詳細表示時）。指示語「この顧客」等の解決に使う
		recordContext?: {
			type: string;
			typeLabel: string;
			id: string;
			label: string;
			data?: Record<string, unknown>;
		} | null;
	};

	if (mockMode) {
		const stream = new ReadableStream({
			async start(controller) {
				const enqueue = (e: StreamEvent) => controller.enqueue(new TextEncoder().encode(sse(e)));
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
	if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

	const sections: string[] = [
		'あなたはダイアログのフォーム入力をサポートするAIアシスタントです。'
	];

	if (body.formFields.length > 0) {
		const fieldList = body.formFields.map((f) => `- ${f.label}（${f.key}）`).join('\n');
		sections.push(
			`このダイアログは「${body.formTitle}」フォームです。ユーザーが各フィールドを正しく入力できるよう、具体的なアドバイスを提供してください。
フォームのフィールド一覧:
${fieldList}`
		);
	}

	sections.push('回答は簡潔にしてください。');

	const systemPrompt = sections.join('\n\n');

	const messages: MessageParam[] = [
		...body.history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text })),
		{ role: 'user', content: body.message }
	];

	const anthropic = new Anthropic({ apiKey });

	const stream = new ReadableStream({
		async start(controller) {
			const enqueue = (e: StreamEvent) => controller.enqueue(new TextEncoder().encode(sse(e)));
			try {
				const claudeStream = anthropic.messages.stream({
					model: 'claude-haiku-4-5-20251001',
					max_tokens: 1024,
					system: systemPrompt,
					messages
				});

				for await (const event of claudeStream) {
					if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
						enqueue({ type: 'delta', text: event.delta.text });
					}
				}

				enqueue({ type: 'done' });
			} catch (e) {
				enqueue({ type: 'error', message: String(e) });
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
	});
};
