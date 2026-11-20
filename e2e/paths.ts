export const AUTH_DIR = "e2e/.auth";
export const SESSION_FILE = `${AUTH_DIR}/session.json`;
export const COLOURS_FULL_FILE = `${AUTH_DIR}/colours-full.json`;
export const COLOURS_EMPTY_FILE = `${AUTH_DIR}/colours-empty.json`;
export const BRANDS_FULL_FILE = `${AUTH_DIR}/brands-full.json`;
export const COMBINATIONS_FULL_FILE = `${AUTH_DIR}/combinations-full.json`;
export const CLOSET_FULL_FILE = `${AUTH_DIR}/closet-full.json`;
export const WISHLIST_FULL_FILE = `${AUTH_DIR}/wishlist-full.json`;
export const POOL_DIR = `${AUTH_DIR}/pool`;
export const CLAIMS_DIR = `${AUTH_DIR}/claims`;
export const poolFile = (n: number) => `${POOL_DIR}/${n}.json`;
export const claimFile = (n: number) => `${CLAIMS_DIR}/${n}`;

export const signOutTests = ["settings", "late-check"] as const;
export const signOutFile = (
	project: string,
	test: (typeof signOutTests)[number],
) => `${AUTH_DIR}/signout-${test}-${project}.json`;

// Per project, one account for the list case and one for Disconnect: cases
// run in parallel, and Disconnect removes the row the list case reads.
export const aiAppTests = ["list", "disconnect"] as const;
export const aiAppFile = (project: string, test: (typeof aiAppTests)[number]) =>
	`${AUTH_DIR}/ai-app-${test}-${project}.json`;
