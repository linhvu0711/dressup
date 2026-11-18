import { expect, test } from "./fixtures";

test("serves the protected resource metadata from the worker", async ({
	request,
}) => {
	// Given: the e2e app (`bun run dev`, Cloudflare's Vite plugin)
	// When
	const res = await request.get("/.well-known/oauth-protected-resource");
	// Then
	expect({
		status: res.status(),
		resource: ((await res.json()) as { resource: string }).resource,
	}).toEqual({ status: 200, resource: "http://localhost:5173/api/mcp" });
});

const ALLOW =
	"/allow?client_id=https%3A%2F%2Fclient.example%2Fmeta.json&ba_param=ba_param&ba_param=client_id&sig=abc";
const SIGNED_QUERY =
	"client_id=https%3A%2F%2Fclient.example%2Fmeta.json&ba_param=ba_param&ba_param=client_id&sig=abc";

const TEST_APP = {
	client_id: "https://client.example/meta.json",
	client_name: "Test App",
	logo_uri: "https://client.example/logo.png",
	redirect_uris: [],
};

test.describe("Allow page", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("https://client.example/logo.png", (route) =>
			route.fulfill({ path: "public/icon-64.png" }),
		);
	});

	test("shows the app's name, logo, and what it wants", async ({ page }) => {
		// Given: a signed-in account; the app loads with its logo
		await page.route("**/api/auth/oauth2/public-client**", (route) =>
			route.fulfill({ json: TEST_APP }),
		);
		// When
		await page.goto(ALLOW);
		// Then
		await expect(page.getByRole("img", { name: "Test App" })).toBeVisible();
		await expect(
			page.getByText(
				"Test App wants to see and change your outfit, colours, brands, looks, and tags.",
			),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Allow" })).toBeVisible();
	});

	test("shows the first letter when the app has no logo", async ({ page }) => {
		// Given: the app's answer has no logo_uri
		const { logo_uri: _, ...noLogo } = TEST_APP;
		await page.route("**/api/auth/oauth2/public-client**", (route) =>
			route.fulfill({ json: noLogo }),
		);
		// When
		await page.goto(ALLOW);
		// Then
		await expect(page.getByRole("img", { name: "Test App" })).toHaveText("T");
	});

	test("shows Could not load this app when the app does not load", async ({
		page,
	}) => {
		// Given: the app's answer fails
		await page.route("**/api/auth/oauth2/public-client**", (route) =>
			route.fulfill({ status: 500, json: {} }),
		);
		// When
		await page.goto(ALLOW);
		// Then
		await expect(page.getByRole("alert")).toHaveText(
			"Could not load this app. Try again.",
		);
		await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Allow" })).toHaveCount(0);
	});

	test("sends Cancel back to the app", async ({ page }) => {
		// Given: the app loads; the consent answer sends the browser back
		await page.route("**/api/auth/oauth2/public-client**", (route) =>
			route.fulfill({ json: TEST_APP }),
		);
		let sent: { accept?: boolean; oauth_query?: string } = {};
		await page.route("**/api/auth/oauth2/consent", (route) => {
			sent = route.request().postDataJSON();
			return route.fulfill({
				json: {
					redirect: true,
					url: "http://127.0.0.1:33418/callback?error=access_denied&state=xyz",
				},
			});
		});
		await page.route("http://127.0.0.1:33418/**", (route) =>
			route.fulfill({ contentType: "text/html", body: "app" }),
		);
		// When
		await page.goto(ALLOW);
		await page.getByRole("button", { name: "Cancel" }).click();
		await page.waitForURL("http://127.0.0.1:33418/**");
		// Then
		expect({
			accept: sent.accept,
			oauthQuery: sent.oauth_query,
			url: page.url(),
		}).toEqual({
			accept: false,
			oauthQuery: SIGNED_QUERY,
			url: "http://127.0.0.1:33418/callback?error=access_denied&state=xyz",
		});
	});
});

test.describe("Allow page without a session", () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test("sends the signed Allow query with the Google sign-in", async ({
		page,
	}) => {
		// Given: no session; the sign-in request is kept and stopped
		let sent: { oauth_query?: string } = {};
		await page.route("**/api/auth/sign-in/social", (route) => {
			sent = route.request().postDataJSON();
			return route.abort();
		});
		// When
		await page.goto(ALLOW);
		const request = page.waitForRequest("**/api/auth/sign-in/social");
		await page.getByRole("button", { name: "Sign in with Google" }).click();
		await request;
		// Then
		expect({ oauthQuery: sent.oauth_query }).toEqual({
			oauthQuery: SIGNED_QUERY,
		});
	});
});
