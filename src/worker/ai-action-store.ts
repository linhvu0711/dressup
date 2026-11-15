import { sql } from "drizzle-orm";
import type { Db } from "./db";
import { aiActionCount } from "./db/ai-action-schema";

export const AI_ACTION_LIMIT = 60;

// Counts one AI action; false when it is past the limit for this minute. The
// count and the raise are one statement, so two calls at once cannot both
// read 60. A call that read the clock before a new minute began can land
// after it; it counts in the new minute, so it cannot start the count again.
export async function countAiAction(db: Db, userId: string): Promise<boolean> {
	const minute = Math.floor(Date.now() / 60_000);
	const [row] = await db
		.insert(aiActionCount)
		.values({ userId, minute, count: 1 })
		.onConflictDoUpdate({
			target: aiActionCount.userId,
			set: {
				count: sql`case when excluded.minute > ${aiActionCount.minute} then 1 else ${aiActionCount.count} + 1 end`,
				minute: sql`max(${aiActionCount.minute}, excluded.minute)`,
			},
		})
		.returning({ count: aiActionCount.count });
	return row.count <= AI_ACTION_LIMIT;
}
