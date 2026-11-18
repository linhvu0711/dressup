import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as aiActionSchema from "./ai-action-schema";
import * as authSchema from "./auth-schema";
import * as colourSchema from "./colour-schema";
import * as dressSchema from "./dress-schema";
import * as lookSchema from "./look-schema";
import * as tagSchema from "./tag-schema";

export const schema = {
	...aiActionSchema,
	...authSchema,
	...colourSchema,
	...dressSchema,
	...lookSchema,
	...tagSchema,
};

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
