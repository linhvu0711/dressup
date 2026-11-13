import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { eq, like } from "drizzle-orm";
import { schema } from "../src/worker/db";
import { E2E_USER, LIMIT_USER, withTestAuth } from "./sessions";

export const SESSION_FILE = "e2e/.auth/session.json";
export const LIMIT_FILE = "e2e/.auth/limit.json";
// LOOK_LIMIT of src/react-app/looks/look.ts, whose "@/" imports the e2e
// type check cannot follow.
const LIMIT_LOOKS = 300;
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
		// Its looks go with the user row.
		await db.delete(schema.user).where(eq(schema.user.id, LIMIT_USER.id));
		await helpers.saveUser(helpers.createUser(LIMIT_USER));
		const looks = Array.from({ length: LIMIT_LOOKS }, (_, n) => ({
			id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
			userId: LIMIT_USER.id,
			modeId: "polo-sweater-chore",
			name: "",
			colours: {
				chino_p: "#C9B38C",
				polo_l: "#F3F1EC",
				sweater: "#1F3A5F",
				chore: "#55633F",
			} as const,
			open: [],
		}));
		// D1 takes at most 100 bound values in one statement; a look binds 6.
		for (let i = 0; i < looks.length; i += 10)
			await db.insert(schema.look).values(looks.slice(i, i + 10));
		const limitCookies = await helpers.getCookies({
			userId: LIMIT_USER.id,
			domain: "localhost",
		});
		writeFileSync(
			LIMIT_FILE,
			JSON.stringify({ cookies: limitCookies, origins: [] }),
		);
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
