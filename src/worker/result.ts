// The stores answer with this, so each error.code becomes an answer in one
// place: an action's refusal row (src/worker/actions/action.ts), or, for the
// families #121 has not moved yet, each door's own map.
export type Result<T, E extends { code: string }> =
	| { ok: true; value: T }
	| { ok: false; error: E };
