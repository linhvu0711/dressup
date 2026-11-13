import { useDressState } from "@/dress/DressState";
import { Mannequin } from "@/dress/figure/Mannequin";
import { MannequinPlaceholder } from "@/dress/figure/MannequinPlaceholder";
import { modeById, outfitOf } from "@/dress/modes";
import { type Look, lookName } from "./look";

const VIEW_BOX = "10 14 380 590";

// The card of docs/prototype/dressup.html:869. A click opens nothing yet
// (#11), so it is not a button. The figure takes the account's skin and hair,
// as the stage does; until they load it is the stage's grey placeholder.
export function LookCard({ look }: { look: Look }) {
	const dress = useDressState();
	return (
		<div data-slot="look-card" className="flex min-w-0 flex-col gap-[7px]">
			<span className="relative block aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-[#D3CFC9] [&>svg]:absolute [&>svg]:inset-0 [&>svg]:size-full">
				{dress.status === "ready" ? (
					<Mannequin
						decorative
						lite
						viewBox={VIEW_BOX}
						layers={outfitOf(modeById(look.modeId), look.colours)}
						openJackets={look.open}
						skin={dress.state.mannequin.skin}
						hair={dress.state.mannequin.hair}
					/>
				) : (
					<MannequinPlaceholder viewBox={VIEW_BOX} />
				)}
			</span>
			<span className="truncate font-medium text-[13.5px]">
				{lookName(look)}
			</span>
		</div>
	);
}
