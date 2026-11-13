import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { eq, like } from "drizzle-orm";
import { schema } from "../src/worker/db";
import { E2E_USER, withTestAuth } from "./sessions";

export const SESSION_FILE = "e2e/.auth/session.json";
// Each test changes the colours it saves, and tests run in parallel, so
// each one claims its own fresh account from this pool (e2e/fixtures.ts).
export const POOL_SIZE = 300;
export const poolFile = (n: number) => `e2e/.auth/pool/${n}.json`;
export const claimFile = (n: number) => `e2e/.auth/claims/${n}`;

export const signOutTests = ["settings", "late-check"] as const;
export const signOutFile = (
	project: string,
	test: (typeof signOutTests)[number],
) => `e2e/.auth/signout-${test}-${project}.json`;

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
		// The pool's dress rows go with its users.
		await db.delete(schema.user).where(like(schema.user.id, "e2e-pool-%"));
		rmSync("e2e/.auth/claims", { recursive: true, force: true });
		mkdirSync("e2e/.auth/claims", { recursive: true });
		mkdirSync("e2e/.auth/pool", { recursive: true });
		for (let n = 0; n < POOL_SIZE; n++) {
			const userId = `e2e-pool-${n}`;
			await helpers.saveUser(
				helpers.createUser({
					id: userId,
					email: `pool-${n}@dressup.test`,
					name: `Pool Person ${n}`,
				}),
			);
			const poolCookies = await helpers.getCookies({
				userId,
				domain: "localhost",
			});
			writeFileSync(
				poolFile(n),
				JSON.stringify({ cookies: poolCookies, origins: [] }),
			);
		}
		// Sign-out ends its session, so each such test gets its own.
		for (const project of ["phone", "laptop"])
			for (const test of signOutTests)
				writeFileSync(
					signOutFile(project, test),
					JSON.stringify(await newSessionCookies()),
				);
	});
}
