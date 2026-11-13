import { createContext, type ReactNode, useContext, useState } from "react";
import type { GarmentId, Hex } from "@/dress/garments";
import type { ModeId } from "@/dress/modes";
import {
	type DressState,
	pickColour,
	pickMode,
	startDressState,
} from "@/dress/state";

type DressStore = {
	state: DressState;
	pickMode: (id: ModeId) => void;
	pickColour: (garment: GarmentId, hex: Hex) => void;
};

const DressStoreContext = createContext<DressStore | null>(null);

// The one place that holds the dress state. It lives in memory for now, so a
// reload starts over; #9 makes this provider save it.
export function DressStateProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState(startDressState);
	const store: DressStore = {
		state,
		pickMode: (id) => setState((s) => pickMode(s, id)),
		pickColour: (garment, hex) => setState((s) => pickColour(s, garment, hex)),
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
