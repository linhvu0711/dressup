import { FigureSvg, Stretch } from "@/dress/figure/frame";
import { GARMENT_DRAWINGS } from "@/dress/figure/garments";
import type { GarmentId } from "@/dress/garments";
import { STARTER_MANNEQUIN } from "@/dress/state";

// Square crops of the figure, each just around the drawn part, so the small
// chip picture fills its box: a top covers x 72 to 327 and y 143 to 459,
// shorts end near y 555, and pants near y 760.
const TOP = "40 140 320 320";
const SHORTS = "100 368 200 200";
const PANTS = "0 368 400 400";

const VIEW_BOX: Record<GarmentId, string> = {
	tee_s: TOP,
	tee_l: TOP,
	polo_s: TOP,
	polo_l: TOP,
	shirt_s: TOP,
	shirt_l: TOP,
	ttee_s: TOP,
	ttee_l: TOP,
	sweater: TOP,
	harrington: TOP,
	wool: TOP,
	chino_sh: SHORTS,
	casual_sh: SHORTS,
	train_sh: SHORTS,
	chino_p: PANTS,
	casual_p: PANTS,
	train_p: PANTS,
};

// One type alone in grey, as a small picture for its chip.
export function TypeFigure({ typeId }: { typeId: GarmentId }) {
	return (
		<FigureSvg
			viewBox={VIEW_BOX[typeId]}
			preserveAspectRatio="xMidYMid meet"
			skin={STARTER_MANNEQUIN.skin}
			hair={STARTER_MANNEQUIN.hair}
			lite
			decorative
			className="-ml-1 size-[22px] flex-none"
		>
			<Stretch>{GARMENT_DRAWINGS[typeId]("#8C8A84", false)}</Stretch>
		</FigureSvg>
	);
}
