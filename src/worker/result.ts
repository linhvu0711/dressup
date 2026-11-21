// The stores answer with this, so each error.code becomes an answer in one
// place: an action's refusal row (src/worker/actions/action.ts).
export type Result<T, E extends { code: string }> =
	| { ok: true; value: T }
	| { ok: false; error: E };

// The first bad field, with the value that was sent for it; body when the
// path names none of the fields.
export function invalidField<F extends string>(
	fields: readonly F[],
	input: unknown,
	path: readonly PropertyKey[],
): {
	ok: false;
	error: { code: "invalid"; field: F | "body"; value?: unknown };
} {
	const key = path[0] as F;
	if (!fields.includes(key))
		return { ok: false, error: { code: "invalid", field: "body" } };
	const value =
		typeof input === "object" && input !== null
			? (input as Record<string, unknown>)[key]
			: undefined;
	return { ok: false, error: { code: "invalid", field: key, value } };
}
