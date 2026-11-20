import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: [
		"./src/worker/db/ai-action-schema.ts",
		"./src/worker/db/auth-schema.ts",
		"./src/worker/db/brand-schema.ts",
		"./src/worker/db/colour-schema.ts",
		"./src/worker/db/combination-schema.ts",
		"./src/worker/db/mannequin-schema.ts",
		"./src/worker/db/owned-item-schema.ts",
		"./src/worker/db/picture-schema.ts",
		"./src/worker/db/tag-schema.ts",
		"./src/worker/db/wish-schema.ts",
	],
	out: "./migrations",
	// A time prefix lets two branches each add a migration with no rename
	// (docs/adr/2026-11-19-migrations-named-by-time.md).
	migrations: { prefix: "timestamp" },
});
