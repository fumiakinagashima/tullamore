import { MASKED_SECRET } from '$lib/types/integration';

const SECRET_FIELDS = ['value', 'password'] as const;

// integrations.authConfig（常にRecord<string,string>）だけでなく db_connections.config
// （tcp_socketの場合 port:number/ssl:boolean 等も混在）でも共用するため、値の型は unknown で緩く受ける
type AnyConfig = Record<string, unknown>;

// 秘匿フィールド（トークン・パスワード）をクライアント向けにマスクする
export function maskAuthConfig(authConfig: AnyConfig): AnyConfig {
	const masked = { ...authConfig };
	for (const key of SECRET_FIELDS) {
		if (masked[key]) masked[key] = MASKED_SECRET;
	}
	return masked;
}

// PATCH時、秘匿フィールドがマスク値（未変更）のままなら既存値を保持する
export function mergeAuthConfig(existing: AnyConfig, incoming: AnyConfig): AnyConfig {
	const merged = { ...incoming };
	for (const key of SECRET_FIELDS) {
		if (merged[key] === MASKED_SECRET) {
			merged[key] = existing[key] ?? '';
		}
	}
	return merged;
}
