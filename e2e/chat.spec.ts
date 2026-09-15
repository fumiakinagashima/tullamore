import { expect, test, type Page } from '@playwright/test';

// All routes require login (src/hooks.server.ts), so log in with the local admin account documented in the README before verifying anything
async function login(page: Page) {
	await page.goto('/signin');
	await page.getByLabel('Email address').fill('admin@example.com');
	await page.getByLabel('Password').fill('password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.waitForURL('/');
}

test('chat page loads with input box', async ({ page }) => {
	await login(page);
	await page.goto('/chat');
	await expect(page.getByRole('heading', { name: 'TULLAMORE' })).toBeVisible();
	await expect(page.getByPlaceholder('Type a message (Shift+Enter for a new line)')).toBeVisible();
});

test('sidebar links to /chat via the new chat link', async ({ page }) => {
	await login(page);
	await page.getByRole('link', { name: 'New chat' }).click();
	await page.waitForURL('/chat');
	await expect(page.getByPlaceholder('Type a message (Shift+Enter for a new line)')).toBeVisible();
});
