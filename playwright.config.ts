import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "e2e",
	testMatch: "**/*.e2e.ts",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	use: { baseURL: "http://localhost:5173" },
	webServer: {
		command: "bun run dev",
		url: "http://localhost:5173",
		reuseExistingServer: !process.env.CI,
	},
	projects: [
		{
			name: "phone",
			use: { browserName: "chromium", viewport: { width: 375, height: 812 } },
		},
		{
			name: "laptop",
			use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
		},
	],
});
