import { cn } from "cn";
import { Check } from "lucide-react";
import { useDressState } from "@/dress/DressState";
import { Mannequin } from "@/dress/figure/Mannequin";
import { MannequinPlaceholder } from "@/dress/figure/MannequinPlaceholder";
import { modeById, outfitOf } from "@/dress/modes";
import { type Look, lookName } from "./look";

const VIEW_BOX = "10 14 380 590";

const CARD = "flex min-w-0 flex-col gap-[7px]";

// The card of docs/prototype/dressup.html:869. A click opens nothing yet
// (#11), so outside the pick state it is not a button. The figure takes the
// account's skin and hair, as the stage does; until they load it is the
// stage's grey placeholder.
export function LookCard({
	look,
	pick,
}: {
	look: Look;
	pick?: { on: boolean; toggle: () => void };
}) {
	const dress = useDressState();
	const body = (
		<>
			<span
				className={cn(
					"relative block aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-[#D3CFC9] [&>svg]:absolute [&>svg]:inset-0 [&>svg]:size-full",
					pick?.on && "outline-2 outline-foreground outline-offset-[2.5px]",
				)}
			>
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
		</>
	);
	if (!pick)
		return (
			<div data-slot="look-card" className={CARD}>
				{body}
			</div>
		);
	// The tick of docs/prototype/dressup.html:152-153.
	return (
		<button
			type="button"
			data-slot="look-card"
			aria-pressed={pick.on}
			onClick={pick.toggle}
			className={cn(CARD, "relative text-left")}
		>
			{body}
			<span
				data-slot="look-tick"
				className={cn(
					"absolute top-[9px] right-[9px] flex size-6 items-center justify-center rounded-full border-[1.5px] border-white text-white shadow-[0_1px_4px_rgba(0,0,0,.35)]",
					pick.on ? "bg-[#1A1917]" : "bg-[rgba(26,25,23,.22)]",
				)}
			>
				{pick.on ? <Check size={14} strokeWidth={1.9} aria-hidden /> : null}
			</span>
		</button>
	);
}
