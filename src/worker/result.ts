// The stores answer with this, so each error.code becomes an answer in one
// place: an action's refusal row (src/worker/actions/action.ts).
export type Result<T, E extends { code: string }> =
	| { ok: true; value: T }
	| { ok: false; error: E };
