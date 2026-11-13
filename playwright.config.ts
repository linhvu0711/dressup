import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "e2e",
	testMatch: "**/*.e2e.ts",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	globalSetup: "./e2e/global-setup.ts",
	use: {
		baseURL: "http://localhost:5173",
		storageState: "e2e/.auth/session.json",
	},
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
