import { cn } from "cn";
import { useDressState } from "@/dress/DressState";
import { GARMENT_NAMES } from "@/dress/garments";
import { modeById } from "@/dress/modes";

// The colour rows of docs/prototype/dressup.html:834-842: one row per garment
// of the mode, top layer first.
export function ColourRows() {
	const { state, pickColour } = useDressState();
	const garments = [...modeById(state.modeId).garments].reverse();
	return (
		<div
			data-slot="colour-rows"
			className="-mx-1.5 min-h-0 flex-1 overflow-auto px-1.5"
		>
			{garments.map((garment) => {
				const name = GARMENT_NAMES[garment];
				const picked = state.picked[garment];
				return (
					<fieldset
						key={garment}
						aria-label={name}
						className="flex min-w-0 flex-col gap-2.5 border-border border-b pt-3.5 pb-4 last:border-b-0"
					>
						<div className="flex min-h-[30px] items-center gap-[9px] font-medium text-sm">
							<span data-slot="colour-row-name">{name}</span>
							<span className="font-mono font-normal text-muted-foreground text-xs">
								{picked}
							</span>
						</div>
						<div className="flex flex-wrap items-center gap-[11px] py-[3px]">
							{state.swatches[garment].map((hex) => (
								<button
									key={hex}
									type="button"
									title={hex}
									aria-label={`${name} ${hex}`}
									aria-pressed={hex === picked}
									onClick={() => pickColour(garment, hex)}
									style={{ background: hex }}
									className={cn(
										"relative size-[34px] flex-none rounded-[10px] [box-shadow:inset_0_0_0_1px_rgba(110,106,98,.38)] transition-transform duration-150 ease-soft hover:scale-[1.07] dark:[box-shadow:inset_0_0_0_1px_rgba(244,241,234,.3)]",
										hex === picked &&
											"outline-2 outline-foreground outline-offset-[2.5px] outline-solid",
									)}
								/>
							))}
						</div>
					</fieldset>
				);
			})}
		</div>
	);
}
