import { X } from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { type ReactNode, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { useCombinations } from "@/combinations/api";
import { CombinationFigure } from "@/combinations/CombinationFigure";
import { CombinationsFailed } from "@/combinations/CombinationsFailed";
import type { Combination } from "@/combinations/combination";
import { SaveCombinationDialog } from "@/combinations/SaveCombinationDialog";
import { useWallAddress } from "@/combinations/wall-address";
import { Button } from "@/components/ui/button";
import { CHIP } from "@/components/ui/chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	LAYER_NAMES,
	LAYER_OF,
	LAYERS,
	type Layer,
	TYPE_IDS,
	TYPE_NAMES,
	type TypeId,
} from "@/dress/clothing-types";
import { MannequinPlaceholder } from "@/dress/figure/MannequinPlaceholder";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { Stage } from "@/dress/Stage";
import { useColours } from "@/labels/api";
import { ColourSwatches } from "@/labels/ColourSwatches";
import type { Colour, ColourId } from "@/labels/colour";
import { useMannequin } from "@/mannequin/api";
import { MannequinFailed } from "@/mannequin/MannequinFailed";
import { PageHeader } from "../shell/PageHeader";

type Picks = Partial<Record<Layer, { typeId: TypeId; colourId: ColourId }>>;

const LABEL = "font-medium text-[12.5px] text-muted-foreground";

const NONE = "none";

// The builder at /build makes a new combination; at /build/<id> it changes a
// saved one, its pieces loaded. The combination found in the list is checked
// first: a failed refetch keeps the old list, and must not drop the picks.
export function BuildPage() {
	const { combinationId } = useParams();
	const combinations = useCombinations();
	const address = useWallAddress();
	if (combinationId === undefined) return <Builder />;
	const found = combinations.data?.find((c) => c.id === combinationId);
	if (found) return <Builder key={found.id} combination={found} />;
	if (combinations.isError)
		return (
			<ChangeShell id={combinationId}>
				<CombinationsFailed onRetry={() => void combinations.refetch()} />
			</ChangeShell>
		);
	if (combinations.isPending)
		return (
			<ChangeShell id={combinationId}>
				<Stage className="mx-3 min-h-0 flex-[0_0_46%] rounded-[24px] wide:mx-6">
					<MannequinPlaceholder />
				</Stage>
			</ChangeShell>
		);
	return <Navigate to={address.wall} replace />;
}

// The header of the builder in change mode, before the combination is in.
function ChangeShell({ id, children }: { id: string; children: ReactNode }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader title="Change combination" start={<Close to={id} />} />
			{children}
		</div>
	);
}

function Close({ to }: { to?: string }) {
	const address = useWallAddress();
	const href = to === undefined ? address.wall : address.combination(to);
	return (
		<Button asChild variant="icon" size="icon">
			<Link to={href} aria-label="Close" title="Close">
				<X size={18} strokeWidth={1.9} aria-hidden />
			</Link>
		</Button>
	);
}

const picksOf = (combination: Combination | undefined): Picks =>
	Object.fromEntries(
		(combination?.pieces ?? []).map((p) => [
			p.layer,
			{ typeId: p.typeId, colourId: p.colour.id },
		]),
	);

// The mannequin on top, the picker below it (beside it from 900 px). A pick
// shows on the mannequin at once; nothing is saved until Save. With no jacket
// the jacket front starts open, as for a new combination.
function Builder({ combination }: { combination?: Combination }) {
	const mannequin = useMannequin();
	const colours = useColours();
	const [picks, setPicks] = useState<Picks>(() => picksOf(combination));
	const [open, setOpen] = useState(() =>
		combination?.pieces.some((p) => p.layer === "jacket")
			? combination.open
			: true,
	);
	const [layer, setLayer] = useState<Layer>("bottom");
	const [saving, setSaving] = useState(false);
	const list = colours.data ?? [];
	// The saved pieces carry their own colours, so a change shows them while
	// the account's colour list loads, or after it failed.
	const known: readonly Colour[] = [
		...list,
		...(combination?.pieces.map((p) => p.colour) ?? []),
	];
	const pieces = LAYERS.flatMap((l) => {
		const p = picks[l];
		const colour = p && known.find((c) => c.id === p.colourId);
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
			next[layer] = { typeId: value as TypeId, colourId };
		}
		setPicks(next);
	}
	function pickColour(colourId: ColourId) {
		if (picked) setPicks({ ...picks, [layer]: { ...picked, colourId } });
	}
	const colourOf = (l: Layer) =>
		known.find((c) => c.id === picks[l]?.colourId)?.hex;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				title={combination ? "Change combination" : "New combination"}
				start={<Close to={combination?.id} />}
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
						{mannequin.isError ? (
							<MannequinFailed onLoadAgain={() => mannequin.refetch()} />
						) : (
							<CombinationFigure
								pieces={pieces.map((p) => ({
									typeId: p.typeId,
									hex: p.colour.hex,
								}))}
								open={open}
								label="Mannequin in the combination"
							/>
						)}
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
								{TYPE_IDS.filter((id) => LAYER_OF[id] === layer).map((id) => (
									<ToggleGroup.Item
										key={id}
										value={id}
										disabled={list.length === 0}
										className={CHIP}
									>
										<TypeFigure typeId={id} />
										{TYPE_NAMES[id]}
									</ToggleGroup.Item>
								))}
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
							{colours.isSuccess && !picked ? (
								<p className="text-[13px] text-muted-foreground">
									Pick a type to choose its colour.
								</p>
							) : (
								<ColourSwatches
									value={picked?.colourId}
									onChange={pickColour}
								/>
							)}
						</div>
					</TabsContent>
				</Tabs>
			</div>
			{saving ? (
				<SaveCombinationDialog
					pieces={pieces}
					open={open}
					changing={combination}
					onClose={() => setSaving(false)}
				/>
			) : null}
		</div>
	);
}
