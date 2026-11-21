import { type ReactNode, useEffect } from "react";
import { useSearchParams } from "react-router";
import type { ActiveFilter } from "./filter";

export type AddressFilterRules<F> = {
	none: F;
	read: (params: URLSearchParams) => F;
	write: (f: F) => URLSearchParams;
	// Drops the labels the account no longer has; a list still loading drops
	// nothing.
	prune: (f: F) => F;
	chips: (f: F) => {
		key: string;
		label: string;
		icon?: ReactNode;
		without: F;
	}[];
};

// The filter of a page lives in its address, so Back and a reload keep it.
// A page that must act on a pick before the address changes gives `pick`.
export function useAddressFilter<F>(
	rules: AddressFilterRules<F>,
	pick?: (next: F, write: (next: F) => void) => void,
) {
	const [params, setParams] = useSearchParams();
	const read = rules.read(params);
	const filter = rules.prune(read);
	// A deleted label leaves the address too: else a reload matches by it
	// until the labels load, and for good when they fail to load. The written
	// addresses are compared, not the sizes: a combination row that loses its
	// colour keeps its type.
	const pruned = rules.write(filter).toString();
	const prunedQuery = pruned !== rules.write(read).toString() ? pruned : null;
	useEffect(() => {
		if (prunedQuery !== null)
			setParams(new URLSearchParams(prunedQuery), { replace: true });
	}, [prunedQuery, setParams]);
	// Each pick replaces the history entry, so Back leaves the page instead of
	// undoing one pick. A pick lands at once: in a transition, a quick second
	// pick would build on the filter before the first and drop it.
	const write = (next: F) =>
		setParams(rules.write(next), { replace: true, flushSync: true });
	const set = (next: F) => (pick ? pick(next, write) : write(next));
	const chips: ActiveFilter[] = rules.chips(filter).map((chip) => ({
		key: chip.key,
		label: chip.label,
		icon: chip.icon,
		onRemove: () => set(chip.without),
	}));
	return {
		filter,
		// One chip is one pick.
		count: chips.length,
		chips,
		set,
		clear: () => set(rules.none),
	};
}
