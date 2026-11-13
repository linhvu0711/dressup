import { useQuery } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useContext,
	useRef,
	useState,
} from "react";
import type { GarmentId, Hex, JacketId } from "@/dress/garments";
import type { ModeId } from "@/dress/modes";
import {
	applyChange,
	type ChangeResult,
	type DressChange,
	type DressState,
	dressStateSchema,
} from "@/dress/state";

type DressCommands = {
	pickMode: (id: ModeId) => void;
	pickColour: (garment: GarmentId, hex: Hex) => void;
	addColour: (garment: GarmentId, hex: Hex) => { added: boolean };
	removeColour: (garment: GarmentId, hex: Hex) => { removed: boolean };
	setJacket: (jacket: JacketId, open: boolean) => void;
};

type DressStore =
	| { status: "loading" }
	| ({ status: "ready"; state: DressState } & DressCommands);

const DressStoreContext = createContext<DressStore | null>(null);

const dressQueryKey = ["dress"] as const;

async function fetchDress(): Promise<DressState> {
	const res = await fetch("/api/dress");
	if (!res.ok) throw new Error(`GET /api/dress answered ${res.status}`);
	return dressStateSchema.parse(await res.json());
}

type Sent = "stored" | "failed";

async function sendChange(change: DressChange): Promise<Sent> {
	try {
		const res = await fetch("/api/dress/changes", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(change),
		});
		return res.status === 204 ? "stored" : "failed";
	} catch {
		return "failed";
	}
}

// The one place that holds the dress state. It starts from the server's copy;
// a change shows at once from React state, and a queue sends the changes to
// the server one at a time, in the order they were made.
export function DressStateProvider({ children }: { children: ReactNode }) {
	const query = useQuery({
		queryKey: dressQueryKey,
		queryFn: fetchDress,
		// The page keeps its own copy once loaded; a refetch is only asked for.
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
	// React state, not the query cache: the cache tells the page a tick later,
	// and a change must show in the same click.
	const [changed, setChanged] = useState<DressState | null>(null);
	const state = changed ?? query.data ?? null;
	// Commands read the latest state, so a result such as `added` is right
	// even when two commands run before the next render.
	const latest = useRef(state);
	latest.current = state;
	const queue = useRef<DressChange[]>([]);
	const sending = useRef(false);

	const flush = async () => {
		if (sending.current) return;
		sending.current = true;
		try {
			while (queue.current.length > 0) {
				const sent = await sendChange(queue.current[0]);
				if (sent === "failed") return;
				queue.current.shift();
			}
		} finally {
			sending.current = false;
		}
	};

	const run = (change: DressChange): ChangeResult | null => {
		if (!latest.current) return null;
		const result = applyChange(latest.current, change);
		if (result.ok) {
			latest.current = result.state;
			setChanged(result.state);
			queue.current.push(change);
			void flush();
		}
		return result;
	};

	const store: DressStore = state
		? {
				status: "ready",
				state,
				pickMode: (modeId) => {
					run({ kind: "mode", modeId });
				},
				pickColour: (garment, hex) => {
					run({ kind: "pick", garment, hex });
				},
				addColour: (garment, hex) => {
					const added = !latest.current?.swatches[garment].includes(hex);
					run({ kind: "add", garment, hex });
					return { added };
				},
				removeColour: (garment, hex) => ({
					removed: run({ kind: "remove", garment, hex })?.ok === true,
				}),
				setJacket: (jacket, open) => {
					run({ kind: "jacket", jacket, open });
				},
			}
		: { status: "loading" };
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
