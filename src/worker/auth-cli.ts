import { betterAuth } from "better-auth";
import { authOptions, createClientDiscovery } from "./auth";
import type { Db } from "./db";

// Read only by `bun run auth:schema`: the Better Auth CLI needs an exported
// instance to write the Drizzle schema, and never touches the database.
export const auth = betterAuth(
	authOptions({
		db: {} as Db,
		secret: undefined,
		// The jwt and mcp plugins need a URL to load; the CLI only writes tables.
		baseURL: "http://localhost:5173",
		google: { clientId: "", clientSecret: "" },
		signupsClosed: false,
		clientDiscovery: createClientDiscovery(),
	}),
);
