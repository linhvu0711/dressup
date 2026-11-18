import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { eq, like } from "drizzle-orm";
import { BRAND_LIMIT } from "@/labels/brand";
import { COLOUR_LIMIT } from "@/labels/colour";
import { LOOK_LIMIT } from "@/looks/look";
import { addBrand } from "../src/worker/brand-store";
import {
	addColour,
	deleteColour,
	listColours,
} from "../src/worker/colour-store";
import { schema } from "../src/worker/db";
import {
	BRANDS_FULL_USER,
	COLOURS_EMPTY_USER,
	COLOURS_FULL_USER,
	E2E_USER,
	LIMIT_USER,
	withTestAuth,
} from "./sessions";

export const SESSION_FILE = "e2e/.auth/session.json";
export const LIMIT_FILE = "e2e/.auth/limit.json";
export const COLOURS_FULL_FILE = "e2e/.auth/colours-full.json";
export const COLOURS_EMPTY_FILE = "e2e/.auth/colours-empty.json";
export const BRANDS_FULL_FILE = "e2e/.auth/brands-full.json";
// Each test changes the colours it saves, and tests run in parallel, so
// each one claims its own fresh account from this pool (e2e/fixtures.ts).
export const POOL_SIZE = 400;
export const poolFile = (n: number) => `e2e/.auth/pool/${n}.json`;
export const claimFile = (n: number) => `e2e/.auth/claims/${n}`;

export const signOutTests = ["settings", "late-check"] as const;
export const signOutFile = (
	project: string,
	test: (typeof signOutTests)[number],
) => `e2e/.auth/signout-${test}-${project}.json`;

// Per project, one account for the list case and one for Disconnect: cases
// run in parallel, and Disconnect removes the row the list case reads.
export const aiAppTests = ["list", "disconnect"] as const;
export const aiAppFile = (project: string, test: (typeof aiAppTests)[number]) =>
	`e2e/.auth/ai-app-${test}-${project}.json`;

const TEST_APP_ID = "https://client.example/meta.json";

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
		const looks = Array.from({ length: LOOK_LIMIT }, (_, n) => ({
			id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
			userId: LIMIT_USER.id,
			modeId: "polo-sweater-harrington",
			name: "",
			colours: {
				chino_p: "#C9B38C",
				polo_l: "#F3F1EC",
				sweater: "#1F3A5F",
				harrington: "#55633F",
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
		// Filled through the colour store, so the seed mark and the ids are the
		// store's own; its colours go with the user row.
		await db
			.delete(schema.user)
			.where(eq(schema.user.id, COLOURS_FULL_USER.id));
		await helpers.saveUser(helpers.createUser(COLOURS_FULL_USER));
		const starter = await listColours(db, COLOURS_FULL_USER.id);
		for (let n = 1; n <= COLOUR_LIMIT - starter.length; n++)
			await addColour(db, COLOURS_FULL_USER.id, {
				name: `Colour ${n}`,
				hex: "#2A7F7F",
			});
		writeFileSync(
			COLOURS_FULL_FILE,
			JSON.stringify({
				cookies: await helpers.getCookies({
					userId: COLOURS_FULL_USER.id,
					domain: "localhost",
				}),
				origins: [],
			}),
		);
		await db
			.delete(schema.user)
			.where(eq(schema.user.id, COLOURS_EMPTY_USER.id));
		await helpers.saveUser(helpers.createUser(COLOURS_EMPTY_USER));
		for (const c of await listColours(db, COLOURS_EMPTY_USER.id))
			await deleteColour(db, COLOURS_EMPTY_USER.id, c.id);
		writeFileSync(
			COLOURS_EMPTY_FILE,
			JSON.stringify({
				cookies: await helpers.getCookies({
					userId: COLOURS_EMPTY_USER.id,
					domain: "localhost",
				}),
				origins: [],
			}),
		);
		// Filled through the brand store; its brands go with the user row.
		await db.delete(schema.user).where(eq(schema.user.id, BRANDS_FULL_USER.id));
		await helpers.saveUser(helpers.createUser(BRANDS_FULL_USER));
		for (let n = 1; n <= BRAND_LIMIT; n++)
			await addBrand(db, BRANDS_FULL_USER.id, `Brand ${n}`);
		writeFileSync(
			BRANDS_FULL_FILE,
			JSON.stringify({
				cookies: await helpers.getCookies({
					userId: BRANDS_FULL_USER.id,
					domain: "localhost",
				}),
				origins: [],
			}),
		);
		// Its allows and tokens go with the client row.
		await db
			.delete(schema.oauthClient)
			.where(eq(schema.oauthClient.clientId, TEST_APP_ID));
		await db.insert(schema.oauthClient).values({
			id: "e2e-test-app",
			clientId: TEST_APP_ID,
			name: "Test App",
			icon: "https://client.example/logo.png",
			redirectUris: ["http://127.0.0.1/callback"],
		});
		// Noon UTC reads as 14 Nov 2026 from UTC-11 to UTC+11.
		const connectedAt = new Date("2026-11-14T12:00:00Z");
		for (const project of ["phone", "laptop"])
			for (const test of aiAppTests) {
				const userId = `e2e-ai-${test}-${project}`;
				await db.delete(schema.user).where(eq(schema.user.id, userId));
				await helpers.saveUser(
					helpers.createUser({
						id: userId,
						email: `ai-${test}-${project}@dressup.test`,
						name: `AI App Person ${test} ${project}`,
					}),
				);
				await db.insert(schema.oauthConsent).values({
					id: userId,
					clientId: TEST_APP_ID,
					userId,
					scopes: ["openid", "offline_access"],
					createdAt: connectedAt,
					updatedAt: connectedAt,
				});
				const aiCookies = await helpers.getCookies({
					userId,
					domain: "localhost",
				});
				writeFileSync(
					aiAppFile(project, test),
					JSON.stringify({ cookies: aiCookies, origins: [] }),
				);
			}
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
