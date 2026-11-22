import { type ChangeEvent, useLayoutEffect, useRef } from "react";

function digitsOf(text: string) {
	return text.replace(/\D/g, "");
}

function cursorAt(shown: string, before: number, pastDots: boolean) {
	let seen = 0;
	let i = 0;
	for (; i < shown.length && seen < before; i++) {
		if (/\d/.test(shown[i])) seen++;
	}
	if (pastDots) while (i < shown.length && !/\d/.test(shown[i])) i++;
	return i;
}

// Keeps a price field's cursor after the same digits when its dots move.
// keep() reads the field at each change, before the price is set.
export function usePriceCursor() {
	const ref = useRef<HTMLInputElement>(null);
	const kept = useRef<{ before: number; pastDots: boolean } | null>(null);
	const digitsShown = useRef(0);
	// React writes the reformatted text, and the browser then puts the cursor
	// at the end. A field the user left keeps its cursor as it is.
	useLayoutEffect(() => {
		const input = ref.current;
		const was = kept.current;
		kept.current = null;
		if (input === null) return;
		digitsShown.current = digitsOf(input.value).length;
		if (was === null || document.activeElement !== input) return;
		const at = cursorAt(input.value, was.before, was.pastDots);
		input.setSelectionRange(at, at);
	});
	const keep = (e: ChangeEvent<HTMLInputElement>) => {
		const input = e.target;
		const typed = input.value.slice(
			0,
			input.selectionEnd ?? input.value.length,
		);
		kept.current = {
			// Leading zeros go, as typedPrice drops them.
			before: digitsOf(typed).replace(/^0+/, "").length,
			// After a Delete the cursor goes past a dot: one the Delete took, which
			// typedPrice puts back, or one the browser left the cursor after. So
			// the next Delete reaches the digit.
			pastDots:
				(e.nativeEvent as InputEvent).inputType === "deleteContentForward" &&
				(digitsOf(input.value).length === digitsShown.current ||
					/\D$/.test(typed)),
		};
	};
	return { ref, keep };
}
