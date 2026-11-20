import type { Page } from "@playwright/test";

export const toast = (page: Page) => page.locator('[data-slot="toast"]');

export const sheet = (page: Page, name?: string | RegExp) =>
	page.getByRole("dialog", name === undefined ? {} : { name });
