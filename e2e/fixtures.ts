import { closeSync, openSync, readdirSync } from "node:fs";
import { test as base, expect } from "@playwright/test";
import { CLAIMS_DIR, claimFile, POOL_DIR, poolFile } from "./global-setup";

// A fresh account from the pool, as its storage state file. A claim file
// made with "wx" is taken by one test only, across all workers.
function claimAccount() {
	const made = readdirSync(POOL_DIR).length;
	for (let n = 0; n < made; n++) {
		try {
			closeSync(openSync(claimFile(n), "wx"));
		} catch {
			continue;
		}
		return poolFile(n);
	}
	const claimed = readdirSync(CLAIMS_DIR).length;
	throw new Error(
		`e2e account pool is empty: global setup made ${made} accounts and tests claimed ${claimed}`,
	);
}

// Each test runs as a fresh account, since tests in parallel would change
// each other's saved colours. A test.use({ storageState }) still wins.
export const test = base.extend({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a fixture needs from this parameter, and this one needs none.
	storageState: async ({}, use) => {
		await use(claimAccount());
	},
});

export { expect };
