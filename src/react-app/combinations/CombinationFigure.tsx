import type { Hex } from "@/colour/hex";
import { Mannequin } from "@/dress/figure/Mannequin";
import { MannequinPlaceholder } from "@/dress/figure/MannequinPlaceholder";
import { type GarmentId, isJacket } from "@/dress/garments";
import { useMannequin } from "@/mannequin/api";
import { wornLayers } from "./combination";

// Pieces on the mannequin in the account's skin and hair, with pale blanks
// for a missing bottom or top; until skin and hair load it is the stage's
// grey placeholder.
export function CombinationFigure({
	pieces,
	open,
	viewBox,
	lite = false,
	label,
}: {
	pieces: readonly { typeId: GarmentId; hex: Hex }[];
	open: boolean;
	viewBox?: string;
	lite?: boolean;
	label?: string;
}) {
	const colours = useMannequin().data;
	if (!colours) return <MannequinPlaceholder viewBox={viewBox} />;
	const jacket = pieces.map((p) => p.typeId).find(isJacket);
	return (
		<Mannequin
			decorative={label === undefined}
			label={label}
			lite={lite}
			viewBox={viewBox}
			layers={wornLayers(pieces)}
			openJackets={open && jacket ? [jacket] : []}
			skin={colours.skin}
			hair={colours.hair}
		/>
	);
}
