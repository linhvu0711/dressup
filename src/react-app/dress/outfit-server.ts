import type { DressChange, DressState } from "@/dress/state";

export type Loaded =
	| { kind: "loaded"; state: DressState }
	| { kind: "failed" }
	| { kind: "signed-out" };

// "refused": the server does not take the change (400), which happens when
// another device changed the row first.
export type Sent = "stored" | "failed" | "signed-out" | "refused";

// The outfit store's one seam to the server. Answers are values, not throws,
// so the store handles each case where it reads the answer.
export type OutfitServer = {
	load: () => Promise<Loaded>;
	send: (change: DressChange) => Promise<Sent>;
};
