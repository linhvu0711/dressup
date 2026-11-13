import {
	createContext,
	type ReactNode,
	useContext,
	useRef,
	useState,
} from "react";
import type { GarmentId, Hex } from "@/dress/garments";
import type { ModeId } from "@/dress/modes";
import {
	addColour,
	type DressState,
	pickColour,
	pickMode,
	startDressState,
} from "@/dress/state";

type DressStore = {
	state: DressState;
	pickMode: (id: ModeId) => void;
	pickColour: (garment: GarmentId, hex: Hex) => void;
	addColour: (garment: GarmentId, hex: Hex) => { added: boolean };
};

const DressStoreContext = createContext<DressStore | null>(null);

// The one place that holds the dress state. It lives in memory for now, so a
// reload starts over; #9 makes this provider save it.
export function DressStateProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState(startDressState);
	// Commands read the latest state, so a result such as `added` is right
	// even when two commands run before the next render.
	const latest = useRef(state);
	const update = (next: DressState) => {
		latest.current = next;
		setState(next);
	};
	const store: DressStore = {
		state,
		pickMode: (id) => update(pickMode(latest.current, id)),
		pickColour: (garment, hex) =>
			update(pickColour(latest.current, garment, hex)),
		addColour: (garment, hex) => {
			const { state: next, added } = addColour(latest.current, garment, hex);
			update(next);
			return { added };
		},
	};
	return (
		<DressStoreContext.Provider value={store}>
			{children}
		</DressStoreContext.Provider>
	);
}

export function useDressState(): DressStore {
	const store = useContext(DressStoreContext);
	if (!store) throw new Error("useDressState needs DressStateProvider");
	return store;
}
