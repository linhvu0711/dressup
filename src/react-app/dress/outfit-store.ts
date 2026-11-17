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
	type Outfit,
} from "@/dress/state";
import type { Look } from "@/looks/look";

export type OutfitView = { account: string | null; unsaved: boolean } & (
	| { status: "loading" }
	| { status: "failed" }
	| { status: "ready"; state: DressState; editing: Look | null }
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
		signedIn,
		retryDelays = [1000, 2000],
	}: {
		report: (report: OutfitReport) => void;
		// Who holds the session now. A second tab can sign in another account,
		// and a load answers for whoever holds the cookie, before the account
		// event of that switch arrives.
		signedIn: () => Promise<string | null>;
		// The waits between tries of the first load.
		retryDelays?: readonly number[];
	},
) {
	let account: string | null = null;
	let state: DressState | null = null;
	// The first load gave up: no outfit to show until it is tried again.
	let failed = false;
	// What the server has stored, so a refused change goes back to it.
	let confirmed: DressState | null = null;
	let queue: DressChange[] = [];
	let sending = false;
	// A change could not be stored and waits on the queue.
	let unsaved = false;
	// The Edit state: the saved look the page holds to change, and the outfit
	// from before it. In memory only: a reload ends the edit and keeps the
	// colours.
	let edit: { look: Look; before: Outfit } | null = null;
	// Holds the load on focus while a form shows the outfit it will save.
	let held = false;
	// Moves on each account switch, so an answer for the account before is
	// dropped.
	let generation = 0;
	// Moves on each change, each load, and each hold, so a load that one of
	// them overtook is dropped: its answer may be older, or land under the
	// save form and change the outfit the save writes.
	let changes = 0;
	let view: OutfitView = { account, unsaved, status: "loading" };
	const listeners = new Set<() => void>();

	const emit = () => {
		view = state
			? {
					account,
					unsaved,
					status: "ready",
					state,
					editing: edit?.look ?? null,
				}
			: { account, unsaved, status: failed ? "failed" : "loading" };
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
		const owner = await signedIn();
		if (gen !== generation || owner !== account) return;
		if (changes !== at || queue.length > 0 || sending) return;
		state = confirmed = loaded.state;
		emit();
	};

	const firstLoad = async () => {
		const at = generation;
		for (const delay of [...retryDelays, null]) {
			const loaded = await server.load();
			if (at !== generation) return;
			if (loaded.kind === "signed-out") {
				report("signed-out");
				return;
			}
			if (loaded.kind === "loaded") {
				state = confirmed = loaded.state;
				emit();
				return;
			}
			if (delay === null) break;
			await new Promise((resolve) => setTimeout(resolve, delay));
			if (at !== generation) return;
		}
		failed = true;
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
				// The server's copy wins: drop the local one and load it. A "wear"
				// may have gone with the queue, so the look is no longer on, and
				// "Save changes" would write the wrong outfit.
				queue = [];
				edit = null;
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
			edit = null;
			held = false;
			failed = false;
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
		// A change made in another session shows when the tab gets focus again.
		// Changes still out would be shown as lost, and a load mid-edit or
		// behind the save form would change the outfit the save writes. A
		// failed change stays first on the queue, so the queue covers a wait
		// to retry too.
		focus: () => {
			if (!state || queue.length > 0 || sending || edit || held) return;
			void loadLatest();
		},
		hold: (on: boolean) => {
			held = on;
			if (on) changes++;
		},
		editLook: (look: Look) => {
			if (!state) return;
			// A second look keeps the outfit from before the first.
			const before = edit?.before ?? {
				modeId: state.modeId,
				colours: state.picked,
				open: state.open,
			};
			edit = { look, before };
			run({
				kind: "wear",
				modeId: look.modeId,
				colours: look.colours,
				open: look.open,
			});
		},
		// Ends the Edit state and puts the outfit from before back, keeping the
		// squares deleted during the edit deleted.
		cancelEdit: () => {
			if (!edit) return;
			const { before } = edit;
			edit = null;
			run({ kind: "restore", ...before });
		},
		// Ends the Edit state and keeps the outfit, after a save or a delete.
		finishEdit: () => {
			edit = null;
			emit();
		},
		// Tries the first load again after it gave up.
		loadAgain: () => {
			if (!failed) return;
			failed = false;
			emit();
			void firstLoad();
		},
		// Sends the queue again after a failed send.
		retry: () => {
			void flush().then((sent) => {
				if (sent === "failed") report("still-unsaved");
			});
		},
	};
}
