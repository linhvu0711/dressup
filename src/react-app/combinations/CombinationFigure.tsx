import type { Hex } from "@/colour/hex";
import { useDressState } from "@/dress/DressState";
import { Mannequin } from "@/dress/figure/Mannequin";
import { MannequinPlaceholder } from "@/dress/figure/MannequinPlaceholder";
import { type GarmentId, isJacket } from "@/dress/garments";
import { wornLayers } from "./combination";

// Pieces on the mannequin in the account's skin and hair, with pale blanks
// for a missing bottom or top; until skin and hair load it is the stage's
// grey placeholder. The skin and hair come through the outfit code until #77.
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
	const dress = useDressState();
	if (dress.status !== "ready")
		return <MannequinPlaceholder viewBox={viewBox} />;
	const jacket = pieces.map((p) => p.typeId).find(isJacket);
	return (
		<Mannequin
			decorative={label === undefined}
			label={label}
			lite={lite}
			viewBox={viewBox}
			layers={wornLayers(pieces)}
			openJackets={open && jacket ? [jacket] : []}
			skin={dress.state.mannequin.skin}
			hair={dress.state.mannequin.hair}
		/>
	);
}
