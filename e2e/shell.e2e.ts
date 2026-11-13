import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test("sends a browser visit to /api/nope to the Worker", async ({ page }) => {
	// Given: the dev server Playwright starts
	// When
	const res = await page.goto("/api/nope");
	// Then
	expect(res?.status()).toBe(404);
	expect(await res?.text()).toBe('{"error":"not_found"}');
});

const tokenNames = [
	"--background",
	"--foreground",
	"--card",
	"--muted",
	"--muted-foreground",
	"--border",
	"--primary",
	"--primary-foreground",
	"--destructive",
] as const;

async function readTokens(page: Page) {
	return page.evaluate((names) => {
		const resolve = (style: string, prop: "color" | "boxShadow") => {
			const probe = document.createElement("div");
			probe.setAttribute("style", style);
			document.body.append(probe);
			const value = getComputedStyle(probe)[prop];
			probe.remove();
			return value;
		};
		const tokens: Record<string, string> = {};
		for (const name of names)
			tokens[name] = resolve(`color: var(${name})`, "color");
		tokens["--shadow"] = resolve("box-shadow: var(--shadow)", "boxShadow");
		tokens.body = getComputedStyle(document.body).backgroundColor;
		return tokens;
	}, tokenNames);
}

test("uses the light tokens", async ({ page }) => {
	// Given: the default colorScheme "light"
	// When
	await page.goto("/");
	const tokens = await readTokens(page);
	// Then
	expect(tokens).toEqual({
		"--background": "rgb(251, 250, 248)",
		"--foreground": "rgb(26, 25, 23)",
		"--card": "rgb(255, 255, 255)",
		"--muted": "rgb(241, 239, 234)",
		"--muted-foreground": "rgb(110, 106, 98)",
		"--border": "rgb(230, 226, 218)",
		"--primary": "rgb(26, 25, 23)",
		"--primary-foreground": "rgb(251, 250, 248)",
		"--destructive": "rgb(180, 35, 24)",
		"--shadow":
			"rgba(40, 32, 20, 0.22) 0px 18px 40px -12px, rgba(40, 32, 20, 0.06) 0px 2px 6px 0px",
		body: "rgb(251, 250, 248)",
	});
});

test.describe("dark device", () => {
	test.use({ colorScheme: "dark" });

	test("uses the dark tokens when the device is dark", async ({ page }) => {
		// Given: colorScheme "dark"
		// When
		await page.goto("/");
		const tokens = await readTokens(page);
		// Then
		expect(tokens).toEqual({
			"--background": "rgb(18, 17, 16)",
			"--foreground": "rgb(244, 241, 234)",
			"--card": "rgb(27, 26, 24)",
			"--muted": "rgb(38, 36, 33)",
			"--muted-foreground": "rgb(169, 164, 154)",
			"--border": "rgb(48, 45, 41)",
			"--primary": "rgb(244, 241, 234)",
			"--primary-foreground": "rgb(22, 21, 19)",
			"--destructive": "rgb(249, 112, 102)",
			"--shadow":
				"rgba(0, 0, 0, 0.7) 0px 18px 44px -12px, rgba(0, 0, 0, 0.4) 0px 2px 6px 0px",
			body: "rgb(18, 17, 16)",
		});
	});
});

test("sets the prototype fonts", async ({ page }) => {
	// Given: both projects
	// When
	await page.goto("/");
	await expect(page.locator("h1")).toHaveText("Dress");
	const fonts = await page.evaluate(() => {
		const probe = document.createElement("div");
		probe.setAttribute("style", "font-family: var(--font-mono)");
		document.body.append(probe);
		const mono = getComputedStyle(probe).fontFamily;
		probe.remove();
		const h1 = document.querySelector("h1");
		const link = document.querySelector<HTMLLinkElement>(
			'link[rel="stylesheet"][href^="https://fonts.googleapis.com"]',
		);
		return {
			title: h1 ? getComputedStyle(h1).fontFamily : "",
			text: getComputedStyle(document.body).fontFamily,
			mono,
			href: link?.href ?? "",
		};
	});
	// Then
	expect(fonts.title.startsWith('"Instrument Serif"')).toBe(true);
	expect(fonts.text.startsWith("Geist,")).toBe(true);
	expect(fonts.mono.startsWith('"Geist Mono"')).toBe(true);
	expect(fonts.href).toBe(
		"https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Instrument+Serif&display=swap",
	);
});

test("clicks through Dress, Looks, Settings, and back to Dress", async ({
	page,
}) => {
	// Given
	await page.goto("/");
	await expect(page.locator("h1")).toHaveText("Dress");
	await expect(page).toHaveURL("/");
	// When
	await page.getByRole("link", { name: "Looks" }).click();
	// Then
	await expect(page.locator("h1")).toHaveText("Looks");
	await expect(page).toHaveURL("/looks");
	// When
	await page.getByRole("link", { name: "Settings" }).click();
	// Then
	await expect(page.locator("h1")).toHaveText("Settings");
	await expect(page).toHaveURL("/settings");
	// When
	await page.getByRole("link", { name: "Dress" }).click();
	// Then
	await expect(page.locator("h1")).toHaveText("Dress");
	await expect(page).toHaveURL("/");
});

test("marks the tab of the open page", async ({ page }) => {
	// Given: both projects
	// When
	await page.goto("/looks");
	// Then
	await expect(page.getByRole("link", { name: "Looks" })).toHaveAttribute(
		"aria-current",
		"page",
	);
	await expect(
		page.getByRole("link", { name: "Dress", exact: true }),
	).not.toHaveAttribute("aria-current");
});

test("shows Page not found with a link to Dress", async ({ page }) => {
	// Given: both projects
	// When
	await page.goto("/nope");
	// Then
	await expect(page.locator("h1")).toHaveText("Page not found");
	// When
	await page.getByRole("link", { name: "Go to Dress" }).click();
	// Then
	await expect(page).toHaveURL("/");
	await expect(page.locator("h1")).toHaveText("Dress");
});

test("shows the bottom bar under 900 px", async ({ page, viewport }) => {
	test.skip((viewport?.width ?? 0) >= 900, "phone layout only");
	// Given: a viewport under 900 px
	// When
	await page.goto("/");
	// Then
	await expect(page.getByRole("banner")).toHaveCount(0);
	await expect(page.getByText("dressup", { exact: true })).toBeHidden();
	const bar = page.getByRole("navigation", { name: "Main" });
	await expect(bar.getByRole("link", { name: "Dress" })).toBeVisible();
	await expect(bar.getByRole("link", { name: "Looks" })).toBeVisible();
	const box = await bar.boundingBox();
	expect({ y: box?.y, height: box?.height }).toEqual({ y: 751, height: 61 });
});

test("shows the top bar from 900 px", async ({ page, viewport }) => {
	test.skip((viewport?.width ?? 0) < 900, "laptop layout only");
	// Given: a viewport of 900 px or more
	// When
	await page.goto("/");
	// Then
	const banner = page.getByRole("banner");
	const box = await banner.boundingBox();
	expect({ y: box?.y, height: box?.height }).toEqual({ y: 0, height: 60 });
	await expect(banner.getByText("dressup", { exact: true })).toBeVisible();
	await expect(banner.getByRole("link", { name: "Dress" })).toBeVisible();
	await expect(banner.getByRole("link", { name: "Looks" })).toBeVisible();
	await expect(banner.getByRole("link").last()).toHaveAccessibleName(
		"Settings",
	);
	await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(1);
});

test("draws the pill button with the prototype size", async ({ page }) => {
	// Given: both projects
	// When
	await page.goto("/nope");
	const pill = await page
		.getByRole("link", { name: "Go to Dress" })
		.evaluate((el) => {
			const style = getComputedStyle(el);
			return { radius: style.borderTopLeftRadius, height: style.height };
		});
	// Then
	expect(pill).toEqual({ radius: "999px", height: "38px" });
});

test("draws the round icon button with the prototype size", async ({
	page,
}) => {
	// Given: both projects
	// When
	await page.goto("/");
	const gear = await page
		.getByRole("link", { name: "Settings" })
		.evaluate((el) => {
			const style = getComputedStyle(el);
			return {
				radius: style.borderTopLeftRadius,
				width: style.width,
				height: style.height,
			};
		});
	// Then
	expect(gear).toEqual({ radius: "50%", width: "36px", height: "36px" });
});

test("links the d icon for the tab and the home screen", async ({ page }) => {
	// Given: both projects
	// When
	await page.goto("/");
	const hrefs = await page.evaluate(() =>
		["icon", "apple-touch-icon", "manifest"].map(
			(rel) =>
				document.querySelector(`link[rel="${rel}"]`)?.getAttribute("href") ??
				"",
		),
	);
	const files = [];
	for (const path of [
		"/icon-64.png",
		"/apple-touch-icon.png",
		"/icon-512.png",
	]) {
		const res = await page.request.get(path);
		files.push({
			path,
			status: res.status(),
			type: res.headers()["content-type"],
		});
	}
	// Then
	expect(hrefs).toEqual([
		"/icon-64.png",
		"/apple-touch-icon.png",
		"/manifest.webmanifest",
	]);
	expect(files).toEqual([
		{ path: "/icon-64.png", status: 200, type: "image/png" },
		{ path: "/apple-touch-icon.png", status: 200, type: "image/png" },
		{ path: "/icon-512.png", status: 200, type: "image/png" },
	]);
});
