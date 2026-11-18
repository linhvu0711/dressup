import { FigureSvg, Stretch } from "@/dress/figure/frame";
import { GARMENT_DRAWINGS } from "@/dress/figure/garments";
import { type GarmentId, LAYER_OF } from "@/dress/garments";
import { STARTER_MANNEQUIN } from "@/dress/state";

// The part of the figure each type covers: a bottom from the waist down, a
// top from the neck to the hips.
const BOTTOM_VIEW_BOX = "110 360 200 400";
const TOP_VIEW_BOX = "70 140 280 340";

// One type alone in grey, as a small picture for its chip.
export function TypeFigure({ typeId }: { typeId: GarmentId }) {
	return (
		<FigureSvg
			viewBox={LAYER_OF[typeId] === "bottom" ? BOTTOM_VIEW_BOX : TOP_VIEW_BOX}
			preserveAspectRatio="xMidYMid meet"
			skin={STARTER_MANNEQUIN.skin}
			hair={STARTER_MANNEQUIN.hair}
			lite
			decorative
			className="size-[18px] flex-none"
		>
			<Stretch>{GARMENT_DRAWINGS[typeId]("#8C8A84", false)}</Stretch>
		</FigureSvg>
	);
}
