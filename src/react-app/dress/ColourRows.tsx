import { cn } from "cn";
import { Check, Pencil, Plus, X } from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { useState } from "react";
import { ColourPicker } from "@/colour/ColourPicker";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useDressState } from "@/dress/DressState";
import {
	GARMENT_NAMES,
	type GarmentId,
	type Hex,
	isJacket,
} from "@/dress/garments";
import { modeById } from "@/dress/modes";

export type LiveColour = { garment: GarmentId; hex: Hex };

// The colour rows: one row per garment
// of the mode, top layer first.
export function ColourRows({
	live,
	onLive,
	titleClassName,
}: {
	live: LiveColour | null;
	onLive: (live: LiveColour | null) => void;
	titleClassName: string;
}) {
	const dress = useDressState();
	const toast = useToast();
	const [adding, setAdding] = useState<GarmentId | null>(null);
	const [editing, setEditing] = useState(false);
	if (dress.status !== "ready")
		return <LoadingRows titleClassName={titleClassName} />;
	const { state, pickColour, addColour, removeColour, setJacket } = dress;
	const mode = modeById(state.modeId);
	const garments = [...mode.garments].reverse();

	// One pencil above all rows.
	const editButton = editing ? (
		<Button
			variant="primary"
			size="icon-sm"
			aria-label="Done"
			title="Done"
			onClick={() => setEditing(false)}
		>
			<Check size={16} />
		</Button>
	) : (
		<Button
			variant="icon"
			size="icon-sm"
			aria-label="Edit colours"
			title="Edit colours"
			onClick={() => setEditing(true)}
		>
			<Pencil size={16} />
		</Button>
	);

	const close = () => {
		setAdding(null);
		onLive(null);
	};

	return (
		<>
			<div className="flex min-h-[34px] flex-none items-center gap-2 text-[13px] wide:hidden">
				<span className="flex-1 text-muted-foreground">{mode.name}</span>
				{editButton}
			</div>
			<div data-slot="colours-title" className={cn(titleClassName, "gap-2")}>
				<span className="flex-1">Colours</span>
				{editButton}
			</div>
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
								{isJacket(garment) ? (
									<ToggleGroup.Root
										type="single"
										aria-label={`${name} front`}
										value={state.open.includes(garment) ? "open" : "closed"}
										onValueChange={(value) => {
											if (value) setJacket(garment, value === "open");
										}}
										className="ml-auto flex flex-none gap-0.5 rounded-full bg-muted p-[3px]"
									>
										{(
											[
												["open", "Open"],
												["closed", "Closed"],
											] as const
										).map(([value, label]) => (
											<ToggleGroup.Item
												key={value}
												value={value}
												className="h-7 rounded-full px-3 font-medium text-muted-foreground text-xs transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-ring data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_3px_rgba(40,32,20,.16)]"
											>
												{label}
											</ToggleGroup.Item>
										))}
									</ToggleGroup.Root>
								) : null}
							</div>
							<div className="flex flex-wrap items-center gap-[11px] py-[3px]">
								{state.swatches[garment].map((hex) => (
									<button
										key={hex}
										type="button"
										title={hex}
										aria-label={`${name} ${hex}${editing ? ", remove" : ""}`}
										aria-pressed={hex === picked}
										onClick={() => {
											if (!editing) pickColour(garment, hex);
											else if (!removeColour(garment, hex).removed)
												toast("A row keeps one colour.");
										}}
										style={{ background: hex }}
										className={cn(
											"relative size-[34px] flex-none rounded-[10px] [box-shadow:inset_0_0_0_1px_rgba(110,106,98,.38)] transition-transform duration-150 ease-soft hover:scale-[1.07] dark:[box-shadow:inset_0_0_0_1px_rgba(244,241,234,.3)]",
											hex === picked &&
												"outline-2 outline-foreground outline-offset-[2.5px] outline-solid",
										)}
									>
										{editing ? (
											<span className="-top-[7px] -right-[7px] absolute flex size-[18px] items-center justify-center rounded-full bg-foreground text-background shadow-[0_1px_3px_rgba(0,0,0,.3)]">
												<X size={11} />
											</span>
										) : null}
									</button>
								))}
								{editing ? null : (
									<button
										type="button"
										title="Add a colour"
										aria-label={`Add a colour to ${name}`}
										onClick={() => setAdding(garment)}
										className="flex size-[34px] flex-none items-center justify-center rounded-[10px] border-[1.5px] border-border border-dashed text-muted-foreground transition-colors duration-150 hover:border-muted-foreground hover:text-foreground"
									>
										<Plus size={16} />
									</button>
								)}
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
		</>
	);
}

const PLACEHOLDER = "animate-placeholder bg-muted motion-reduce:animate-none";

// The rows wait for the server, so while they load they show as grey bars
// and squares, in the look of the other loading placeholders.
function LoadingRows({ titleClassName }: { titleClassName: string }) {
	return (
		<>
			<div className={cn(titleClassName, "gap-2")}>
				<span className="flex-1">Colours</span>
			</div>
			<div
				data-slot="colour-rows-loading"
				className="-mx-1.5 min-h-0 flex-1 overflow-hidden px-1.5"
			>
				{[0, 1, 2].map((row) => (
					<div
						key={row}
						className="flex flex-col gap-2.5 border-border border-b pt-3.5 pb-4 last:border-b-0"
					>
						<div className="flex min-h-[30px] items-center">
							<div className={cn("h-3.5 w-[40%] rounded-[6px]", PLACEHOLDER)} />
						</div>
						<div className="flex gap-[11px] py-[3px]">
							{[0, 1, 2, 3].map((square) => (
								<div
									key={square}
									className={cn("size-[34px] rounded-[10px]", PLACEHOLDER)}
								/>
							))}
						</div>
					</div>
				))}
			</div>
		</>
	);
}
