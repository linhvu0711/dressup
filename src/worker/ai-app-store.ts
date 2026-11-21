import { and, asc, eq, ne } from "drizzle-orm";
import type { AiApp } from "@/ai-apps/ai-app";
import type { Db } from "./db";
import { oauthClient, oauthConsent, oauthRefreshToken } from "./db/auth-schema";

// An AI app is connected while its allow row for the account exists: the
// row better-auth writes on Allow.

// The account's connected AI apps, oldest connect first. An app whose
// document has no client_name is named by its client id. An AI app asks with
// except set to its own client id, since it is always connected itself.
export async function listAiApps(
	db: Db,
	userId: string,
	{ except }: { except?: string } = {},
): Promise<AiApp[]> {
	const rows = await db
		.select({
			id: oauthConsent.id,
			clientId: oauthClient.clientId,
			name: oauthClient.name,
			icon: oauthClient.icon,
			createdAt: oauthConsent.createdAt,
		})
		.from(oauthConsent)
		.innerJoin(oauthClient, eq(oauthConsent.clientId, oauthClient.clientId))
		.where(
			and(
				eq(oauthConsent.userId, userId),
				except === undefined ? undefined : ne(oauthConsent.clientId, except),
			),
		)
		.orderBy(asc(oauthConsent.createdAt), asc(oauthConsent.id));
	return rows.map((row) => ({
		id: row.id,
		name: row.name ?? row.clientId,
		logo: row.icon,
		connectedAt: row.createdAt.toISOString(),
	}));
}

export async function isAiAppAllowed(
	db: Db,
	userId: string,
	clientId: string,
): Promise<boolean> {
	const [allow] = await db
		.select({ id: oauthConsent.id })
		.from(oauthConsent)
		.where(
			and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)),
		)
		.limit(1);
	return allow !== undefined;
}

// False when the account has no allow of that id: gone already, or another
// account's. The refresh tokens go too, since one would get new passes until
// it ends; both deletes run as one batch, all or nothing.
export async function disconnectAiApp(
	db: Db,
	userId: string,
	id: string,
): Promise<boolean> {
	const [allow] = await db
		.select({ clientId: oauthConsent.clientId })
		.from(oauthConsent)
		.where(and(eq(oauthConsent.id, id), eq(oauthConsent.userId, userId)))
		.limit(1);
	if (!allow) return false;
	await db.batch([
		db
			.delete(oauthRefreshToken)
			.where(
				and(
					eq(oauthRefreshToken.userId, userId),
					eq(oauthRefreshToken.clientId, allow.clientId),
				),
			),
		db
			.delete(oauthConsent)
			.where(and(eq(oauthConsent.id, id), eq(oauthConsent.userId, userId))),
	]);
	return true;
}
