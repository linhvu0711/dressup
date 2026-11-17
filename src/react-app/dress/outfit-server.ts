import {
	type DressChange,
	type DressState,
	dressStateSchema,
} from "@/dress/state";

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

// The server the page talks to. It calls fetch directly for now; #60 routes
// it through the shared request helper.
export function httpOutfitServer(): OutfitServer {
	return {
		load: async () => {
			try {
				const res = await fetch("/api/dress");
				if (res.status === 401) return { kind: "signed-out" };
				if (!res.ok) return { kind: "failed" };
				return {
					kind: "loaded",
					state: dressStateSchema.parse(await res.json()),
				};
			} catch {
				return { kind: "failed" };
			}
		},
		send: async (change) => {
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
		},
	};
}
