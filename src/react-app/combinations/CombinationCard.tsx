import { cn } from "cn";
import { useEffect, useRef } from "react";
import { CombinationFigure } from "./CombinationFigure";
import { type Combination, combinationTitle } from "./combination";

const VIEW_BOX = "10 14 380 590";

// One card on the wall: the drawn mannequin and the title. It opens nothing
// yet (#71). A marked card, the one the address names, has an outline round
// its picture and scrolls into view once.
export function CombinationCard({
	combination,
	marked = false,
}: {
	combination: Combination;
	marked?: boolean;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (marked) ref.current?.scrollIntoView({ block: "nearest" });
	}, [marked]);
	return (
		<div
			ref={ref}
			data-slot="combination-card"
			aria-current={marked ? "true" : undefined}
			className="flex min-w-0 flex-col gap-[7px]"
		>
			<span
				className={cn(
					"relative block aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-[#D3CFC9] [&>svg]:absolute [&>svg]:inset-0 [&>svg]:size-full",
					marked && "outline-2 outline-foreground outline-offset-[2.5px]",
				)}
			>
				<CombinationFigure
					pieces={combination.pieces.map((p) => ({
						typeId: p.typeId,
						hex: p.colour.hex,
					}))}
					open={combination.open}
					viewBox={VIEW_BOX}
					lite
				/>
			</span>
			<span
				data-slot="combination-title"
				className="line-clamp-2 font-medium text-[13.5px]"
			>
				{combinationTitle(combination)}
			</span>
		</div>
	);
}
