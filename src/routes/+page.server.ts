import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { getNotification, markNotificationRead } from '$lib/server/db/notification-service';
import { getChat, listChatMessages } from '$lib/server/db/chat-service';

export const load: PageServerLoad = async ({ url, platform, locals }) => {
	const notificationId = url.searchParams.get('notification');
	const chatId = url.searchParams.get('id');

	if (!platform?.env?.DB)
		return { seedNotification: null, seedChat: null };

	const db = createDb(platform.env.DB);

	if (notificationId) {
		const notification = await getNotification(db, notificationId);
		if (!notification) return { seedNotification: null, seedChat: null };
		if (notification.accountId && notification.accountId !== locals.account!.id) {
			return { seedNotification: null, seedChat: null };
		}

		if (!notification.isRead) await markNotificationRead(db, notificationId);

		return {
			seedNotification: { id: notification.id, seedContent: notification.seedContent },
			seedChat: null
		};
	}

	if (chatId) {
		const chat = await getChat(db, chatId);
		if (!chat) return { seedNotification: null, seedChat: null };
		if (chat.accountId && chat.accountId !== locals.account!.id) {
			return { seedNotification: null, seedChat: null };
		}

		const messages = await listChatMessages(db, chatId);
		return { seedNotification: null, seedChat: { id: chat.id, messages } };
	}

	return { seedNotification: null, seedChat: null };
};
