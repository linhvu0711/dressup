import { betterAuth } from "better-auth";
import { authOptions } from "./auth";
import type { Db } from "./db";

// Read only by `bun run auth:schema`: the Better Auth CLI needs an exported
// instance to write the Drizzle schema, and never touches the database.
export const auth = betterAuth(
	authOptions({
		db: {} as Db,
		secret: undefined,
		baseURL: undefined,
		google: { clientId: "", clientSecret: "" },
	}),
);
