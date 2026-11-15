import { and, asc, eq } from "drizzle-orm";
import type { AiApp } from "@/ai-apps/ai-app";
import type { Db } from "./db";
import { oauthClient, oauthConsent } from "./db/auth-schema";

// An AI app is connected while its allow row for the account exists: the
// row better-auth writes on Allow.

// The account's connected AI apps, oldest connect first. An app whose
// document has no client_name is named by its client id.
export async function listAiApps(db: Db, userId: string): Promise<AiApp[]> {
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
		.where(eq(oauthConsent.userId, userId))
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
