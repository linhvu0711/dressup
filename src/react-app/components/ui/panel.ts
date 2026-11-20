// The steps of an add or change panel: its form, the delete ask, or a list
// the panel names that swaps in over the form.
export type PanelStep = "form" | "delete" | (string & {});

export type PanelState<Id extends string> = { id: Id; step: PanelStep };

export type PanelEvent =
	| { type: "change" }
	| { type: "pick" }
	| { type: "open"; step: string }
	| { type: "back" }
	| { type: "delete" };

// One id for each try, so a Save after a failed Save that did reach the
// server gives back the same record rather than a second one. A new value
// in an add panel is a new record, so it takes a new id from `fresh`; a
// change panel has none, since its record keeps its id.
export function nextPanel<Id extends string>(
	state: PanelState<Id>,
	event: PanelEvent,
	fresh: (() => Id) | null,
): { state: PanelState<Id>; deletes: boolean } {
	const tried = () => (fresh ? fresh() : state.id);
	switch (event.type) {
		case "change":
			return { state: { id: tried(), step: state.step }, deletes: false };
		case "pick":
			return { state: { id: tried(), step: "form" }, deletes: false };
		case "open":
			return { state: { id: state.id, step: event.step }, deletes: false };
		case "back":
			return { state: { id: state.id, step: "form" }, deletes: false };
		case "delete":
			return state.step === "delete"
				? { state, deletes: true }
				: { state: { id: state.id, step: "delete" }, deletes: false };
	}
}
