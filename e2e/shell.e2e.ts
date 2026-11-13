import { expect, test } from "@playwright/test";

test("sends a browser visit to /api/nope to the Worker", async ({ page }) => {
	// Given: the dev server Playwright starts
	// When
	const res = await page.goto("/api/nope");
	// Then
	expect(res?.status()).toBe(404);
	expect(await res?.text()).toBe('{"error":"not_found"}');
});
