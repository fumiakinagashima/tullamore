import { expect, test, type Page } from '@playwright/test';

// 全ルートがログイン必須（src/hooks.server.ts）なため、README記載のローカル管理者アカウントでログインしてから検証する
async function login(page: Page) {
	await page.goto('/signin');
	await page.getByLabel('メールアドレス').fill('info@alcogy.com');
	await page.getByLabel('パスワード').fill('password');
	await page.getByRole('button', { name: 'サインイン' }).click();
	await page.waitForURL('/');
}

test('chat page loads with input box', async ({ page }) => {
	await login(page);
	await page.goto('/chat');
	await expect(page.getByRole('heading', { name: 'TULLAMORE' })).toBeVisible();
	await expect(page.getByPlaceholder('メッセージを入力（Shift+Enter で改行）')).toBeVisible();
});

test('sidebar links to /chat via 新しいチャット', async ({ page }) => {
	await login(page);
	await page.getByRole('link', { name: '新しいチャット' }).click();
	await page.waitForURL('/chat');
	await expect(page.getByPlaceholder('メッセージを入力（Shift+Enter で改行）')).toBeVisible();
});
