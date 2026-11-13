import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { schema } from "../src/worker/db";
import { E2E_USER, withTestAuth } from "./sessions";

export const SESSION_FILE = "e2e/.auth/session.json";
export const signOutFile = (project: string) =>
	`e2e/.auth/signout-${project}.json`;

export default async function globalSetup() {
	// No TTY on stdin, so wrangler applies without its confirm prompt.
	execFileSync("bun", ["run", "db:migrate:local"], {
		stdio: ["ignore", "inherit", "inherit"],
	});
	await withTestAuth(async ({ db, helpers, newSessionCookies }) => {
		// Delete first, so a second run ends in the same state.
		await db.delete(schema.user).where(eq(schema.user.id, E2E_USER.id));
		await helpers.saveUser(helpers.createUser(E2E_USER));
		mkdirSync("e2e/.auth", { recursive: true });
		const cookies = await newSessionCookies();
		writeFileSync(SESSION_FILE, JSON.stringify({ cookies, origins: [] }));
		for (const project of ["phone", "laptop"])
			writeFileSync(
				signOutFile(project),
				JSON.stringify(await newSessionCookies()),
			);
	});
}
