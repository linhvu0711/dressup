// The worker modules answer with this, so the website route and the AI tools
// each turn error.code into an answer in one place.
export type Result<T, E extends { code: string }> =
	| { ok: true; value: T }
	| { ok: false; error: E };
