import { focusManager } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useToast } from "@/components/ui/toast";
import { sessionUserId } from "@/data/client";
import type { GarmentId, Hex, JacketId } from "@/dress/garments";
import type { ModeId } from "@/dress/modes";
import { httpOutfitServer } from "@/dress/outfit-server";
import { createOutfitStore } from "@/dress/outfit-store";
import type { DressState, MannequinPart } from "@/dress/state";
import type { Look } from "@/looks/look";

type DressCommands = {
	pickMode: (id: ModeId) => void;
	pickColour: (garment: GarmentId, hex: Hex) => void;
	addColour: (garment: GarmentId, hex: Hex) => { added: boolean };
	removeColour: (garment: GarmentId, hex: Hex) => { removed: boolean };
	setJacket: (jacket: JacketId, open: boolean) => void;
	setMannequinColour: (part: MannequinPart, hex: Hex) => void;
	// The edit state: the saved look the page holds to change, or null.
	editing: Look | null;
	editLook: (look: Look) => void;
	// Ends the edit state and puts the outfit from before back, keeping the
	// squares deleted during the edit deleted.
	cancelEdit: () => void;
	// Ends the edit state and keeps the outfit, after a save or a delete.
	finishEdit: () => void;
	// Holds the load on tab focus while a form shows the outfit it will save.
	holdLoads: (hold: boolean) => void;
};

// `unsaved`: a change could not be stored and waits on the queue.
type DressStore = { unsaved: boolean; retry: () => void } & (
	| { status: "loading" }
	// The first load gave up; `loadAgain` tries it again.
	| { status: "failed"; loadAgain: () => void }
	| ({ status: "ready"; state: DressState } & DressCommands)
);

const DressStoreContext = createContext<DressStore | null>(null);

// Gives the page the outfit store (src/react-app/dress/outfit-store.ts),
// which holds the outfit and its saving rules, and passes it the events it
// needs: who is signed in, and when the tab gets focus.
// `userId`: the signed-in account, or null while there is none.
export function DressStateProvider({
	userId,
	children,
}: {
	userId: string | null;
	children: ReactNode;
}) {
	const toast = useToast();
	const latestToast = useRef(toast);
	latestToast.current = toast;
	const [store] = useState(() =>
		createOutfitStore(httpOutfitServer(), {
			report: (report) => {
				// request() ran the 401 rule already: the session check runs again
				// and finds none.
				if (report === "signed-out") return;
				latestToast.current(
					report === "saved" ? "Saved" : "Still no connection.",
				);
			},
			signedIn: sessionUserId,
		}),
	);
	// Before paint, so the page never draws one account's outfit for another.
	useLayoutEffect(() => store.account(userId), [store, userId]);
	useEffect(
		() =>
			focusManager.subscribe((focused) => {
				if (focused) store.focus();
			}),
		[store],
	);
	const view = useSyncExternalStore(store.subscribe, store.view);

	// The page is rebuilt for each account; until the store has switched too,
	// it gets nothing of the account before, such as its Edit state.
	const value: DressStore =
		view.account !== userId || view.status === "loading"
			? { unsaved: false, retry: store.retry, status: "loading" }
			: view.status === "failed"
				? {
						unsaved: false,
						retry: store.retry,
						status: "failed",
						loadAgain: store.loadAgain,
					}
				: {
						unsaved: view.unsaved,
						retry: store.retry,
						status: "ready",
						state: view.state,
						editing: view.editing,
						pickMode: store.pickMode,
						pickColour: store.pickColour,
						addColour: store.addColour,
						removeColour: store.removeColour,
						setJacket: store.setJacket,
						setMannequinColour: store.setMannequinColour,
						editLook: store.editLook,
						cancelEdit: store.cancelEdit,
						finishEdit: store.finishEdit,
						holdLoads: store.hold,
					};
	return (
		<DressStoreContext.Provider value={value}>
			{children}
		</DressStoreContext.Provider>
	);
}

export function useDressState(): DressStore {
	const store = useContext(DressStoreContext);
	if (!store) throw new Error("useDressState needs DressStateProvider");
	return store;
}
