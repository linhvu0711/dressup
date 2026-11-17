import { afterEach } from "bun:test";

// Bun runs a hook from an imported helper module only for some test files, so
// the real fetch goes back from this preload, which runs for every file.
const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});
