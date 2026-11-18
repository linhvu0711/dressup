import { cn } from "cn";
import { X } from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { useState } from "react";
import { Link } from "react-router";
import { CombinationFigure } from "@/combinations/CombinationFigure";
import { SaveCombinationDialog } from "@/combinations/SaveCombinationDialog";
import { Button } from "@/components/ui/button";
import { CHIP } from "@/components/ui/chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import {
	GARMENT_IDS,
	GARMENT_NAMES,
	type GarmentId,
	LAYER_NAMES,
	LAYER_OF,
	LAYERS,
	type Layer,
} from "@/dress/garments";
import { Stage } from "@/dress/Stage";
import { useColours } from "@/labels/api";
import type { ColourId } from "@/labels/colour";
import { PageHeader } from "../shell/PageHeader";

type Picks = Partial<Record<Layer, { typeId: GarmentId; colourId: ColourId }>>;

const LABEL = "font-medium text-[12.5px] text-muted-foreground";

const NONE = "none";

const PULSE = "animate-placeholder motion-reduce:animate-none";

// The builder: the mannequin on top, the picker below it (beside it from
// 900 px). A pick shows on the mannequin at once; nothing is saved until Save.
export function BuildPage() {
	const colours = useColours();
	const [picks, setPicks] = useState<Picks>({});
	const [open, setOpen] = useState(true);
	const [layer, setLayer] = useState<Layer>("bottom");
	const [saving, setSaving] = useState(false);
	const list = colours.data ?? [];
	const pieces = LAYERS.flatMap((l) => {
		const p = picks[l];
		const colour = p && list.find((c) => c.id === p.colourId);
		return p && colour ? [{ typeId: p.typeId, colour }] : [];
	});
	const picked = picks[layer];
	const enough = pieces.length >= 2;
	// A type keeps the layer's colour, else takes the account's first, so a
	// piece is always a type and a colour.
	function pickType(value: string) {
		const next = { ...picks };
		if (value === NONE) delete next[layer];
		else {
			const colourId = picked?.colourId ?? list[0]?.id;
			if (!colourId) return;
			next[layer] = { typeId: value as GarmentId, colourId };
		}
		setPicks(next);
	}
	function pickColour(colourId: ColourId) {
		if (picked) setPicks({ ...picks, [layer]: { ...picked, colourId } });
	}
	const colourOf = (l: Layer) =>
		list.find((c) => c.id === picks[l]?.colourId)?.hex;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				title="New combination"
				start={
					<Button asChild variant="icon" size="icon">
						<Link to="/combinations" aria-label="Close" title="Close">
							<X size={18} strokeWidth={1.9} aria-hidden />
						</Link>
					</Button>
				}
				end={
					<Button
						variant="primary"
						disabled={!enough}
						onClick={() => setSaving(true)}
					>
						Save
					</Button>
				}
			/>
			{enough ? null : (
				<p className="-mt-1 px-4 pb-2 text-[12.5px] text-muted-foreground wide:px-6">
					Pick 2 pieces or more
				</p>
			)}
			<div className="flex min-h-0 flex-1 flex-col wide:grid wide:grid-cols-[minmax(0,1fr)_420px] wide:grid-rows-[minmax(0,1fr)]">
				<div
					data-slot="build-stage"
					className="flex min-h-0 flex-[0_0_46%] flex-col wide:mx-6 wide:mb-4 wide:flex-1"
				>
					<Stage className="min-h-0 flex-1 rounded-b-[24px] wide:rounded-[26px]">
						<CombinationFigure
							pieces={pieces.map((p) => ({
								typeId: p.typeId,
								hex: p.colour.hex,
							}))}
							open={open}
							label="Mannequin in the combination"
						/>
					</Stage>
				</div>
				<Tabs
					value={layer}
					onValueChange={(value) => setLayer(value as Layer)}
					className="min-h-0 flex-1 gap-3 px-4 pt-3 wide:px-6 wide:pt-0"
				>
					<TabsList aria-label="Layer">
						{LAYERS.map((l) => (
							<TabsTrigger key={l} value={l} className="gap-1.5">
								{LAYER_NAMES[l]}
								{colourOf(l) ? (
									<span
										aria-hidden
										className="inline-block size-[7px] rounded-full [box-shadow:inset_0_0_0_1px_rgba(110,106,98,.38)]"
										style={{ background: colourOf(l) }}
									/>
								) : null}
							</TabsTrigger>
						))}
					</TabsList>
					{/* Only the picker scrolls, so the layer tabs stay in view. Its
					    margin puts the scrollbar at the column edge, and its padding
					    keeps the picked swatch's outline from being cut. */}
					<TabsContent
						value={layer}
						className="-mx-4 flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pt-1 pb-8 wide:-mx-6 wide:px-6"
					>
						<div className="flex flex-col gap-2">
							<span className={LABEL}>Type</span>
							<ToggleGroup.Root
								type="single"
								aria-label="Type"
								value={picked?.typeId ?? NONE}
								onValueChange={(value) => {
									// Radix gives "" when the chip that is on is clicked again.
									if (value) pickType(value);
								}}
								className="flex flex-wrap gap-[7px]"
							>
								<ToggleGroup.Item value={NONE} className={CHIP}>
									None
								</ToggleGroup.Item>
								{GARMENT_IDS.filter((id) => LAYER_OF[id] === layer).map(
									(id) => (
										<ToggleGroup.Item
											key={id}
											value={id}
											disabled={list.length === 0}
											className={CHIP}
										>
											<TypeFigure typeId={id} />
											{GARMENT_NAMES[id]}
										</ToggleGroup.Item>
									),
								)}
							</ToggleGroup.Root>
						</div>
						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-3">
								<span className={LABEL}>Colour</span>
								{layer === "jacket" && picked ? (
									<ToggleGroup.Root
										type="single"
										aria-label="Jacket front"
										value={open ? "open" : "closed"}
										onValueChange={(value) => {
											if (value) setOpen(value === "open");
										}}
										className="ml-auto flex flex-none gap-0.5 rounded-full bg-muted p-[3px]"
									>
										{(
											[
												["closed", "Closed"],
												["open", "Open"],
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
							<Colours
								colours={colours}
								picked={picked?.colourId}
								onPick={pickColour}
								hasType={picked !== undefined}
							/>
						</div>
					</TabsContent>
				</Tabs>
			</div>
			{saving ? (
				<SaveCombinationDialog
					pieces={pieces}
					open={open}
					onClose={() => setSaving(false)}
				/>
			) : null}
		</div>
	);
}

function Colours({
	colours,
	picked,
	onPick,
	hasType,
}: {
	colours: ReturnType<typeof useColours>;
	picked: ColourId | undefined;
	onPick: (id: ColourId) => void;
	hasType: boolean;
}) {
	if (colours.isPending)
		return (
			<div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-y-3">
				{Array.from({ length: 8 }, (_, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: the squares are all alike and never move.
						key={i}
						className={`size-[34px] rounded-[10px] bg-muted ${PULSE}`}
					/>
				))}
			</div>
		);
	if (colours.isError)
		return (
			<div className="flex items-center gap-3">
				<p role="alert" className="text-[13px] text-destructive">
					Could not load your colours
				</p>
				<Button onClick={() => void colours.refetch()}>Retry</Button>
			</div>
		);
	if (!hasType)
		return (
			<p className="text-[13px] text-muted-foreground">
				Pick a type to choose its colour.
			</p>
		);
	return (
		<ToggleGroup.Root
			type="single"
			aria-label="Colour"
			value={picked ?? ""}
			onValueChange={(value) => {
				if (value) onPick(value as ColourId);
			}}
			className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-y-3"
		>
			{colours.data.map((c) => (
				<ToggleGroup.Item
					key={c.id}
					value={c.id}
					aria-label={c.name}
					title={c.hex}
					className="group flex flex-col items-center gap-1.5"
				>
					<span
						style={{ background: c.hex }}
						className={cn(
							"size-[34px] rounded-[10px] [box-shadow:inset_0_0_0_1px_rgba(110,106,98,.38)] transition-transform duration-150 ease-soft group-hover:scale-[1.07] dark:[box-shadow:inset_0_0_0_1px_rgba(244,241,234,.3)]",
							c.id === picked &&
								"outline-2 outline-foreground outline-offset-[2.5px] outline-solid",
						)}
					/>
					<span className="max-w-full truncate text-[11.5px] text-muted-foreground">
						{c.name}
					</span>
				</ToggleGroup.Item>
			))}
		</ToggleGroup.Root>
	);
}
