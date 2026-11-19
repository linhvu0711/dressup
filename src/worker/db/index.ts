import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as aiActionSchema from "./ai-action-schema";
import * as authSchema from "./auth-schema";
import * as brandSchema from "./brand-schema";
import * as colourSchema from "./colour-schema";
import * as combinationSchema from "./combination-schema";
import * as dressSchema from "./dress-schema";
import * as lookSchema from "./look-schema";
import * as mannequinSchema from "./mannequin-schema";
import * as ownedItemSchema from "./owned-item-schema";
import * as pictureSchema from "./picture-schema";
import * as tagSchema from "./tag-schema";
import * as wishSchema from "./wish-schema";

export const schema = {
	...aiActionSchema,
	...authSchema,
	...brandSchema,
	...colourSchema,
	...combinationSchema,
	...dressSchema,
	...lookSchema,
	...mannequinSchema,
	...ownedItemSchema,
	...pictureSchema,
	...tagSchema,
	...wishSchema,
};

// Two tabs can both pass a duplicate check; a unique index then refuses the
// second write, with an error that names the index. D1 and drizzle may wrap
// it, so the causes are read too.
export const hitsIndex = (error: unknown, index: string): boolean =>
	error instanceof Error &&
	(error.message.includes(index) || hitsIndex(error.cause, index));

// Both the D1 database in the Worker and bun:sqlite in tests fit this type.
// D1 runs a batch as one transaction; the test harness gives bun:sqlite the
// same, so a change's rows are written all or nothing in both.
export type Db = BaseSQLiteDatabase<
	"sync" | "async",
	unknown,
	typeof schema
> & {
	batch<U extends BatchItem<"sqlite">, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>>;
};
