import type { GarmentId, Hex, JacketId } from "@/dress/garments";
import type { ModeId } from "@/dress/modes";
import type { OutfitServer, Sent } from "@/dress/outfit-server";
import {
	addColour as addSquare,
	applyChange,
	type ChangeResult,
	type DressChange,
	type DressState,
	type MannequinPart,
} from "@/dress/state";

export type OutfitView = { account: string | null; unsaved: boolean } & (
	| { status: "loading" }
	| { status: "ready"; state: DressState }
);

export type OutfitReport = "saved" | "still-unsaved" | "signed-out";

export type OutfitStore = ReturnType<typeof createOutfitStore>;

// The Dress page's outfit and the rules that save it. A change shows at once;
// a queue sends the changes to the server one at a time, in the order they
// were made. React reads `view` and passes events in; the store says what a
// person should hear through `report`.
export function createOutfitStore(
	server: OutfitServer,
	{
		report,
	}: {
		report: (report: OutfitReport) => void;
		// The waits between tries of the first load.
		retryDelays?: readonly number[];
	},
) {
	let account: string | null = null;
	let state: DressState | null = null;
	// What the server has stored, so a refused change goes back to it.
	let confirmed: DressState | null = null;
	let queue: DressChange[] = [];
	let sending = false;
	// A change could not be stored and waits on the queue.
	let unsaved = false;
	// Moves on each account switch, so an answer for the account before is
	// dropped.
	let generation = 0;
	// Moves on each change and each load, so a load that one of them overtook
	// is dropped: its answer may be older.
	let changes = 0;
	let view: OutfitView = { account, unsaved, status: "loading" };
	const listeners = new Set<() => void>();

	const emit = () => {
		view = state
			? { account, unsaved, status: "ready", state }
			: { account, unsaved, status: "loading" };
		for (const listener of listeners) listener();
	};

	// Loads once, and shows the answer only when nothing overtook it.
	const loadLatest = async () => {
		const at = ++changes;
		const gen = generation;
		const loaded = await server.load();
		if (gen !== generation) return;
		if (loaded.kind === "signed-out") report("signed-out");
		if (loaded.kind !== "loaded") return;
		if (changes !== at || queue.length > 0 || sending) return;
		state = confirmed = loaded.state;
		emit();
	};

	const firstLoad = async () => {
		const at = generation;
		const loaded = await server.load();
		if (at !== generation) return;
		if (loaded.kind === "signed-out") report("signed-out");
		if (loaded.kind !== "loaded") return;
		state = confirmed = loaded.state;
		emit();
	};

	// Sends the queue in order and stops at the first change that cannot be
	// stored, which stays first on the queue and on the screen.
	const sendQueue = async (at: number): Promise<Sent> => {
		while (queue.length > 0) {
			const sent = await server.send(queue[0]);
			if (at !== generation) return sent;
			if (sent === "failed") {
				unsaved = true;
				emit();
				return sent;
			}
			if (sent === "refused") {
				// The server's copy wins: drop the local one and load it.
				queue = [];
				unsaved = false;
				state = confirmed;
				emit();
				return sent;
			}
			if (sent === "signed-out") {
				queue = [];
				unsaved = false;
				emit();
				report("signed-out");
				return sent;
			}
			const done = queue.shift() as DressChange;
			const next = confirmed && applyChange(confirmed, done);
			if (next?.ok) confirmed = next.state;
		}
		if (unsaved) {
			unsaved = false;
			emit();
			report("saved");
		}
		return "stored";
	};

	const flush = async (): Promise<Sent | "busy"> => {
		if (sending) return "busy";
		sending = true;
		const at = generation;
		let sent: Sent;
		try {
			sent = await sendQueue(at);
		} finally {
			sending = false;
		}
		// The account changed while a change was out: send the new queue.
		if (at !== generation) return queue.length > 0 ? flush() : sent;
		if (sent === "refused") void loadLatest();
		return sent;
	};

	const push = (change: DressChange, next: DressState) => {
		state = next;
		queue.push(change);
		changes++;
		emit();
		void flush();
	};

	const run = (change: DressChange): ChangeResult | null => {
		if (!state) return null;
		const result = applyChange(state, change);
		if (result.ok) push(change, result.state);
		return result;
	};

	return {
		view: () => view,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		// The signed-in account, or null while there is none. Changes belong to
		// the account that made them; another account starts from its own copy.
		account: (next: string | null) => {
			if (next === account) return;
			account = next;
			generation++;
			queue = [];
			unsaved = false;
			state = confirmed = null;
			emit();
			if (next !== null) void firstLoad();
		},
		pickMode: (modeId: ModeId) => {
			run({ kind: "mode", modeId });
		},
		pickColour: (garment: GarmentId, hex: Hex) => {
			run({ kind: "pick", garment, hex });
		},
		addColour: (garment: GarmentId, hex: Hex) => {
			if (!state) return { added: false };
			const { state: next, added } = addSquare(state, garment, hex);
			push({ kind: "add", garment, hex }, next);
			return { added };
		},
		removeColour: (garment: GarmentId, hex: Hex) => ({
			removed: run({ kind: "remove", garment, hex })?.ok === true,
		}),
		setJacket: (jacket: JacketId, open: boolean) => {
			run({ kind: "jacket", jacket, open });
		},
		setMannequinColour: (part: MannequinPart, hex: Hex) => {
			run({ kind: "mannequin", part, hex });
		},
		// Sends the queue again after a failed send.
		retry: () => {
			void flush().then((sent) => {
				if (sent === "failed") report("still-unsaved");
			});
		},
	};
}
