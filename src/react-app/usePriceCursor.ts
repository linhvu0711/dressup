import { useLayoutEffect, useRef } from "react";

function cursorAt(shown: string, before: number) {
	let seen = 0;
	for (let i = 0; i < shown.length; i++) {
		if (seen === before) return i;
		if (/\d/.test(shown[i])) seen++;
	}
	return shown.length;
}

// Keeps a price field's cursor after the same digits when its dots move.
// keep() reads the field at each change, before the price is set.
export function usePriceCursor() {
	const ref = useRef<HTMLInputElement>(null);
	const before = useRef<number | null>(null);
	// React writes the reformatted text, and the browser then puts the cursor
	// at the end. A field the user left keeps its cursor as it is.
	useLayoutEffect(() => {
		const input = ref.current;
		const count = before.current;
		before.current = null;
		if (input === null || count === null || document.activeElement !== input)
			return;
		const at = cursorAt(input.value, count);
		input.setSelectionRange(at, at);
	});
	const keep = (input: HTMLInputElement) => {
		// Leading zeros go, as typedPrice drops them.
		before.current = input.value
			.slice(0, input.selectionEnd ?? input.value.length)
			.replace(/\D/g, "")
			.replace(/^0+/, "").length;
	};
	return { ref, keep };
}
