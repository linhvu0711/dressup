import { cn } from "cn";
import { Check } from "lucide-react";
import { Link } from "react-router";
import { LookFigure } from "./LookFigure";
import { type Look, lookName } from "./look";

const VIEW_BOX = "10 14 380 590";

const CARD = "flex min-w-0 flex-col gap-[7px]";

// The card of docs/prototype/dressup.html:869: a link that opens the look.
// From 900 px the picked card's picture has the outline of :116; under
// 900 px the look is its own page, so no card is marked (:868). In the pick
// state it is a button that picks the look to compare.
export function LookCard({
	look,
	picked = false,
	pick,
}: {
	look: Look;
	picked?: boolean;
	pick?: { on: boolean; toggle: () => void };
}) {
	const body = (
		<>
			<span
				className={cn(
					"relative block aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-[#D3CFC9] [&>svg]:absolute [&>svg]:inset-0 [&>svg]:size-full",
					pick
						? pick.on && "outline-2 outline-foreground outline-offset-[2.5px]"
						: "wide:group-aria-[current=true]:outline-2 wide:group-aria-[current=true]:outline-offset-[2.5px] wide:group-aria-[current=true]:outline-foreground",
				)}
			>
				<LookFigure look={look} viewBox={VIEW_BOX} lite />
			</span>
			<span className="truncate font-medium text-[13.5px]">
				{lookName(look)}
			</span>
		</>
	);
	if (!pick)
		return (
			<Link
				to={`/looks/${look.id}`}
				data-slot="look-card"
				aria-current={picked ? "true" : undefined}
				className={cn(CARD, "group")}
			>
				{body}
			</Link>
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
