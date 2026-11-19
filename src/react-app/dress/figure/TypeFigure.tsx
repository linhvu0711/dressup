import type { Hex } from "@/colour/hex";
import type { TypeId } from "@/dress/clothing-types";
import { FigureSvg, Stretch } from "@/dress/figure/frame";
import { TYPE_DRAWINGS } from "@/dress/figure/type-drawings";
import { STARTER_MANNEQUIN } from "@/mannequin/mannequin";

// Square crops of the figure, each just around the drawn part, so the small
// chip picture fills its box: a top covers x 72 to 327 and y 143 to 459,
// shorts end near y 555, and pants near y 760.
const TOP = "40 140 320 320";
const SHORTS = "100 368 200 200";
const PANTS = "0 368 400 400";

const VIEW_BOX: Record<TypeId, string> = {
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

// One type alone, grey unless a colour is given, as a small picture for its
// chip or a tile. A jacket alone is drawn open, with no switch (#91).
export function TypeFigure({
	typeId,
	hex = "#8C8A84",
	className = "-ml-1 size-[22px] flex-none",
}: {
	typeId: TypeId;
	hex?: Hex;
	className?: string;
}) {
	return (
		<FigureSvg
			viewBox={VIEW_BOX[typeId]}
			preserveAspectRatio="xMidYMid meet"
			skin={STARTER_MANNEQUIN.skin}
			hair={STARTER_MANNEQUIN.hair}
			lite
			decorative
			className={className}
		>
			<Stretch>{TYPE_DRAWINGS[typeId](hex, true)}</Stretch>
		</FigureSvg>
	);
}
