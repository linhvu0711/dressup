import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: [
		"./src/worker/db/auth-schema.ts",
		"./src/worker/db/dress-schema.ts",
		"./src/worker/db/look-schema.ts",
		"./src/worker/db/tag-schema.ts",
	],
	out: "./migrations",
});
