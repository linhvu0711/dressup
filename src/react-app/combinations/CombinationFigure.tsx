import type { Hex } from "@/colour/hex";
import type { TypeId } from "@/dress/clothing-types";
import { Mannequin } from "@/dress/figure/Mannequin";
import { MannequinPlaceholder } from "@/dress/figure/MannequinPlaceholder";
import { useMannequin } from "@/mannequin/api";
import { wornLayers } from "./combination";

// Pieces on the mannequin in the account's skin and hair, with pale blanks
// for a missing bottom or top; until skin and hair load it is the stage's
// grey placeholder.
export function CombinationFigure({
	pieces,
	viewBox,
	lite = false,
	label,
}: {
	pieces: readonly { typeId: TypeId; hex: Hex }[];
	viewBox?: string;
	lite?: boolean;
	label?: string;
}) {
	// Every page that shows a figure loads the colours itself and keeps them
	// fresh. A wall's figures mount as they scroll near, and a load for each
	// would ask the server again on every scroll.
	const colours = useMannequin({ refetchOnMount: false }).data;
	if (!colours) return <MannequinPlaceholder viewBox={viewBox} />;
	return (
		<Mannequin
			decorative={label === undefined}
			label={label}
			lite={lite}
			viewBox={viewBox}
			layers={wornLayers(pieces)}
			skin={colours.skin}
			hair={colours.hair}
		/>
	);
}
