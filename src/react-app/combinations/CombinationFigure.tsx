import type { Hex } from "@/colour/hex";
import type { TypeId } from "@/dress/clothing-types";
import { Mannequin } from "@/dress/figure/Mannequin";
import { MannequinPlaceholder } from "@/dress/figure/MannequinPlaceholder";
import { useMannequin } from "@/mannequin/api";
import { MannequinFailed } from "@/mannequin/MannequinFailed";
import { wornLayers } from "./combination";

// Pieces on the mannequin in the account's skin and hair, with pale blanks
// for a missing bottom or top; until skin and hair load it is the stage's
// grey placeholder. A failed load shows Could not load your mannequin, but a
// lite card keeps the grey shape: it sits inside a link, often beside others.
export function CombinationFigure({
	pieces,
	viewBox,
	lite = false,
	label,
	refetchOnMount = true,
}: {
	pieces: readonly { typeId: TypeId; hex: Hex }[];
	viewBox?: string;
	lite?: boolean;
	label?: string;
	refetchOnMount?: boolean;
}) {
	const mannequin = useMannequin({ refetchOnMount });
	if (mannequin.isError && !lite)
		return <MannequinFailed onLoadAgain={() => mannequin.refetch()} />;
	const colours = mannequin.data;
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
