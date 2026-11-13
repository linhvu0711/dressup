import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useContext,
	useRef,
	useState,
} from "react";
import { useToast } from "@/components/ui/toast";
import type { GarmentId, Hex, JacketId } from "@/dress/garments";
import type { ModeId } from "@/dress/modes";
import {
	applyChange,
	type ChangeResult,
	type DressChange,
	type DressState,
	dressStateSchema,
} from "@/dress/state";
import { meQueryKey } from "@/session";

type DressCommands = {
	pickMode: (id: ModeId) => void;
	pickColour: (garment: GarmentId, hex: Hex) => void;
	addColour: (garment: GarmentId, hex: Hex) => { added: boolean };
	removeColour: (garment: GarmentId, hex: Hex) => { removed: boolean };
	setJacket: (jacket: JacketId, open: boolean) => void;
};

// `unsaved`: a change could not be stored and waits on the queue.
type DressStore = { unsaved: boolean; retry: () => void } & (
	| { status: "loading" }
	| ({ status: "ready"; state: DressState } & DressCommands)
);

const DressStoreContext = createContext<DressStore | null>(null);

const dressQueryKey = ["dress"] as const;

class SignedOut extends Error {}

async function fetchDress(): Promise<DressState> {
	const res = await fetch("/api/dress");
	if (res.status === 401) throw new SignedOut("GET /api/dress answered 401");
	if (!res.ok) throw new Error(`GET /api/dress answered ${res.status}`);
	return dressStateSchema.parse(await res.json());
}

// "refused": the server does not take the change (400), which happens when
// another device changed the row first.
type Sent = "stored" | "failed" | "signed-out" | "refused";

async function sendChange(change: DressChange): Promise<Sent> {
	try {
		const res = await fetch("/api/dress/changes", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(change),
		});
		if (res.status === 204) return "stored";
		if (res.status === 401) return "signed-out";
		if (res.status === 400) return "refused";
		return "failed";
	} catch {
		return "failed";
	}
}

// The one place that holds the dress state. It starts from the server's copy;
// a change shows at once from React state, and a queue sends the changes to
// the server one at a time, in the order they were made.
export function DressStateProvider({
	enabled,
	children,
}: {
	enabled: boolean;
	children: ReactNode;
}) {
	const queryClient = useQueryClient();
	// A lost session makes the session check run again; it finds none, and
	// the session gate shows the sign-in screen.
	const signOut = () => queryClient.invalidateQueries({ queryKey: meQueryKey });
	const query = useQuery({
		queryKey: dressQueryKey,
		queryFn: async () => {
			try {
				return await fetchDress();
			} catch (error) {
				if (error instanceof SignedOut) void signOut();
				throw error;
			}
		},
		retry: (count, error) => !(error instanceof SignedOut) && count < 3,
		enabled,
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
	const toast = useToast();
	const [unsaved, setUnsaved] = useState(false);
	const unsavedRef = useRef(false);
	const markUnsaved = (value: boolean) => {
		unsavedRef.current = value;
		setUnsaved(value);
	};

	// Sends the queue in order and stops at the first change that cannot be
	// stored, which stays first on the queue and on the screen.
	const flush = async (): Promise<Sent | "busy"> => {
		if (sending.current) return "busy";
		sending.current = true;
		try {
			while (queue.current.length > 0) {
				const sent = await sendChange(queue.current[0]);
				if (sent === "failed") {
					markUnsaved(true);
					return "failed";
				}
				if (sent === "signed-out" || sent === "refused") {
					queue.current = [];
					markUnsaved(false);
					if (sent === "signed-out") void signOut();
					else {
						// The server's copy wins: drop the local one and load it.
						setChanged(null);
						void queryClient.invalidateQueries({ queryKey: dressQueryKey });
					}
					return sent;
				}
				const done = queue.current.shift();
				// The cache follows what the server stored, so a later refusal
				// goes back to that and not to the first load.
				if (done)
					queryClient.setQueryData<DressState>(dressQueryKey, (old) => {
						const next = old && applyChange(old, done);
						return next?.ok ? next.state : old;
					});
			}
			if (unsavedRef.current) {
				markUnsaved(false);
				toast("Saved");
			}
			return "stored";
		} finally {
			sending.current = false;
		}
	};

	// The prototype's retry, docs/prototype/dressup.html:1087.
	const retry = () => {
		void flush().then((result) => {
			if (result === "failed") toast("Still no connection.");
		});
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
				unsaved,
				retry,
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
		: { unsaved, retry, status: "loading" };
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
