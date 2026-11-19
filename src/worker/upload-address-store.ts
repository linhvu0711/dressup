import { and, eq, gt, lte } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db";
import { uploadAddress } from "./db/picture-schema";

export const UPLOAD_ADDRESS_AGE_MS = 900_000;

const uploadAddressIdSchema = z.uuid().brand<"UploadAddressId">();

export type UploadAddressId = z.infer<typeof uploadAddressIdSchema>;

// The app has no cron, so an account's expired addresses go when it asks for
// a new one.
export async function giveUploadAddress(
	db: Db,
	userId: string,
): Promise<{ id: UploadAddressId; expiresAt: Date }> {
	const now = Date.now();
	const id = crypto.randomUUID() as UploadAddressId;
	const expiresAt = new Date(now + UPLOAD_ADDRESS_AGE_MS);
	await db.batch([
		db
			.delete(uploadAddress)
			.where(
				and(
					eq(uploadAddress.userId, userId),
					lte(uploadAddress.expiresAt, new Date(now)),
				),
			),
		db.insert(uploadAddress).values({ id, userId, expiresAt }),
	]);
	return { id, expiresAt };
}

// The account an address belongs to, or null when it was used or expired. The
// check and the delete are one statement, so two uploads at once cannot both
// claim it.
export async function claimUploadAddress(
	db: Db,
	id: string,
): Promise<string | null> {
	if (!uploadAddressIdSchema.safeParse(id).success) return null;
	const [row] = await db
		.delete(uploadAddress)
		.where(
			and(eq(uploadAddress.id, id), gt(uploadAddress.expiresAt, new Date())),
		)
		.returning({ userId: uploadAddress.userId });
	return row?.userId ?? null;
}
