import { closeSync, openSync } from "node:fs";
import { test as base, expect } from "@playwright/test";
import { claimFile, POOL_SIZE, poolFile } from "./global-setup";

// A fresh account from the pool, as its storage state file. A claim file
// made with "wx" is taken by one test only, across all workers.
export function claimAccount() {
	for (let n = 0; n < POOL_SIZE; n++) {
		try {
			closeSync(openSync(claimFile(n), "wx"));
		} catch {
			continue;
		}
		return poolFile(n);
	}
	throw new Error(
		"e2e account pool is empty: raise POOL_SIZE in e2e/global-setup.ts",
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
