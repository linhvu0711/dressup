import { useDressState } from "@/dress/DressState";
import { Mannequin } from "@/dress/figure/Mannequin";
import { MannequinPlaceholder } from "@/dress/figure/MannequinPlaceholder";
import { modeById, outfitOf } from "@/dress/modes";
import type { Look } from "./look";

// A look on the mannequin in the account's skin and hair, as the stage
// draws it; until they load it is the stage's grey placeholder.
export function LookFigure({
	look,
	viewBox,
	lite = false,
}: {
	look: Look;
	viewBox: string;
	lite?: boolean;
}) {
	const dress = useDressState();
	if (dress.status !== "ready")
		return <MannequinPlaceholder viewBox={viewBox} />;
	return (
		<Mannequin
			decorative
			lite={lite}
			viewBox={viewBox}
			layers={outfitOf(modeById(look.modeId), look.colours)}
			openJackets={look.open}
			skin={dress.state.mannequin.skin}
			hair={dress.state.mannequin.hair}
		/>
	);
}
