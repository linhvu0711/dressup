import { useState } from "react";
import { ColourField } from "@/colour/ColourPicker";
import type { Hex } from "@/colour/hex";
import { useAddColour, useChangeColour, useDeleteColour } from "./api";
import { COLOUR_LIMIT, COLOUR_NAME_MAX, type ListedColour } from "./colour";
import { LabelSheet, type LabelWords } from "./LabelSheet";

const START: Hex = "#1F3A5F";

const WORDS: LabelWords = {
	addTitle: "Add a colour",
	editTitle: "Edit colour",
	addLabel: "Add",
	confirmTitle: (name) => `Delete the colour "${name}"?`,
	confirmText: "It goes from your list of colours.",
	inUseText:
		"A combination, an item in your closet, or a wish uses this colour, so you cannot delete it.",
	taken: "You have this colour already.",
	full: `You have ${COLOUR_LIMIT} colours. That is the limit. Delete one to add a new one.`,
	added: "Colour added",
	deleted: "Colour deleted",
};

// The form to add a colour, or to change the one it is given: a name and
// the colour field.
export function ColourSheet({
	colours,
	editing,
	onClose,
}: {
	colours: ListedColour[];
	editing: ListedColour | null;
	onClose: () => void;
}) {
	const [hex, setHex] = useState<Hex | null>(editing?.hex ?? START);
	const add = useAddColour();
	const change = useChangeColour();
	const del = useDeleteColour();
	return (
		<LabelSheet
			words={WORDS}
			labels={colours}
			limit={COLOUR_LIMIT}
			limitCode="colour_limit"
			inUseCode="colour_in_use"
			nameMax={COLOUR_NAME_MAX}
			editing={editing}
			extra={{
				ready: hex !== null,
				field: (submit) => (
					<ColourField
						start={editing?.hex ?? START}
						onChange={setHex}
						onEnter={() => submit()}
					/>
				),
			}}
			onSave={(name) => {
				// LabelSheet sends only when the field is ready, so a code is set.
				const code = hex as Hex;
				return editing
					? change.mutateAsync({ id: editing.id, name, hex: code })
					: add.mutateAsync({ name, hex: code });
			}}
			onDelete={(id) => del.mutateAsync(id)}
			onClose={onClose}
		/>
	);
}
