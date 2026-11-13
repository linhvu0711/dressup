import { expect, type Page, test } from "@playwright/test";

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
