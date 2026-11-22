import type { Page } from "@playwright/test";

export const toast = (page: Page) => page.locator('[data-slot="toast"]');

export const sheet = (page: Page, name?: string | RegExp) =>
	page.getByRole("dialog", name === undefined ? {} : { name });

export const facts = (page: Page) => page.locator('[data-slot="facts"]');

export const fact = (page: Page, term: string) =>
	facts(page)
		.locator("div")
		.filter({ has: page.getByText(term, { exact: true }) })
		.locator("dd");
