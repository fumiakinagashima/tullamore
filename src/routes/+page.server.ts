import type { PageServerLoad } from './$types';
import { createDb } from '$lib/server/db';
import { getNotification, markNotificationRead } from '$lib/server/db/notification-service';
import { getChat, listChatMessages } from '$lib/server/db/chat-service';
import { listKpiPlans } from '$lib/server/db/kpi-service';
import { computeAllKpiAchievements } from '$lib/server/analysis/kpi-achievement';

export const load: PageServerLoad = async ({ url, platform, locals }) => {
	const notificationId = url.searchParams.get('notification');
	const chatId = url.searchParams.get('id');

	if (!platform?.env?.DB)
		return { seedNotification: null, seedChat: null, kpiAchievements: [] };

	const db = createDb(platform.env.DB);
	const kpiAchievements = await computeAllKpiAchievements(db, platform.env.DB, await listKpiPlans(db));

	if (notificationId) {
		const notification = await getNotification(db, notificationId);
		if (!notification) return { seedNotification: null, seedChat: null, kpiAchievements };
		if (notification.accountId && notification.accountId !== locals.account!.id) {
			return { seedNotification: null, seedChat: null, kpiAchievements };
		}

		if (!notification.isRead) await markNotificationRead(db, notificationId);

		return {
			seedNotification: { id: notification.id, seedContent: notification.seedContent },
			seedChat: null,
			kpiAchievements
		};
	}

	if (chatId) {
		const chat = await getChat(db, chatId);
		if (!chat) return { seedNotification: null, seedChat: null, kpiAchievements };
		if (chat.accountId && chat.accountId !== locals.account!.id) {
			return { seedNotification: null, seedChat: null, kpiAchievements };
		}

		const messages = await listChatMessages(db, chatId);
		return { seedNotification: null, seedChat: { id: chat.id, messages }, kpiAchievements };
	}

	return { seedNotification: null, seedChat: null, kpiAchievements };
};
