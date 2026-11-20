# Coding standards

## Tests

A role lookup whose name is the start of another name on the page passes `exact: true`.
Playwright matches a role name as a substring, so a link named `Close` also finds `Closet`. Example: `e2e/closet.e2e.ts:41`, `page.getByRole("heading", { name: "Closet", exact: true })`.

While a dialog or sheet is open, a test finds the rows behind it by `data-slot`, not by role.
The open dialog hides the page behind it from role lookups, so a role lookup for a row finds nothing. Example: `e2e/brands.e2e.ts:94`, `page.locator('[data-slot="brand-list"] li')`, read while the New brand sheet is open.

Each test makes its ids with `crypto.randomUUID()`.
All test accounts share one local database, so a fixed id posted by a second test is refused as a conflict. Example: `e2e/closet-helpers.ts:17`, `data: { id: crypto.randomUUID(), ...body }`.

## Not covered

Every other area. This file starts with the e2e lookup rules from #108.
