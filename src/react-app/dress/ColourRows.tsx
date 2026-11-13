import { cn } from "cn";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ColourPicker } from "@/colour/ColourPicker";
import { useToast } from "@/components/ui/toast";
import { useDressState } from "@/dress/DressState";
import { GARMENT_NAMES, type GarmentId, type Hex } from "@/dress/garments";
import { modeById } from "@/dress/modes";

export type LiveColour = { garment: GarmentId; hex: Hex };

// The colour rows of docs/prototype/dressup.html:834-842: one row per garment
// of the mode, top layer first.
export function ColourRows({
	live,
	onLive,
}: {
	live: LiveColour | null;
	onLive: (live: LiveColour | null) => void;
}) {
	const { state, pickColour, addColour } = useDressState();
	const toast = useToast();
	const [adding, setAdding] = useState<GarmentId | null>(null);
	const garments = [...modeById(state.modeId).garments].reverse();

	const close = () => {
		setAdding(null);
		onLive(null);
	};

	return (
		<div
			data-slot="colour-rows"
			className="-mx-1.5 min-h-0 flex-1 overflow-auto px-1.5"
		>
			{garments.map((garment) => {
				const name = GARMENT_NAMES[garment];
				const picked = state.picked[garment];
				const shown = live?.garment === garment ? live.hex : picked;
				return (
					<fieldset
						key={garment}
						aria-label={name}
						className="flex min-w-0 flex-col gap-2.5 border-border border-b pt-3.5 pb-4 last:border-b-0"
					>
						<div className="flex min-h-[30px] items-center gap-[9px] font-medium text-sm">
							<span data-slot="colour-row-name">{name}</span>
							<span className="font-mono font-normal text-muted-foreground text-xs">
								{shown}
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
							<button
								type="button"
								title="Add a colour"
								aria-label={`Add a colour to ${name}`}
								onClick={() => setAdding(garment)}
								className="flex size-[34px] flex-none items-center justify-center rounded-[10px] border-[1.5px] border-border border-dashed text-muted-foreground transition-colors duration-150 hover:border-muted-foreground hover:text-foreground"
							>
								<Plus size={16} />
							</button>
						</div>
					</fieldset>
				);
			})}
			{adding ? (
				<ColourPicker
					title={`New colour · ${GARMENT_NAMES[adding]}`}
					start={state.picked[adding]}
					action="Add"
					onLive={(hex) => onLive({ garment: adding, hex })}
					onCancel={close}
					onDone={(hex) => {
						const { added } = addColour(adding, hex);
						close();
						if (!added) toast("You have this colour already. It is on now.");
					}}
				/>
			) : null}
		</div>
	);
}
