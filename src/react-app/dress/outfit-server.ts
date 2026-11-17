import { RequestError, request, SignedOut } from "@/data/client";
import { dressAnswer } from "@/data/contract";
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

// The server the page talks to, through the data module's request helper.
export function httpOutfitServer(): OutfitServer {
	return {
		load: async () => {
			try {
				return {
					kind: "loaded",
					state: await request("GET", "/api/dress", { answer: dressAnswer }),
				};
			} catch (error) {
				return error instanceof SignedOut
					? { kind: "signed-out" }
					: { kind: "failed" };
			}
		},
		send: async (change) => {
			try {
				await request("POST", "/api/dress/changes", { body: change });
				return "stored";
			} catch (error) {
				if (error instanceof SignedOut) return "signed-out";
				if (error instanceof RequestError && error.status === 400)
					return "refused";
				return "failed";
			}
		},
	};
}
