import { cn } from "cn";
import { Minus, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { pieceName } from "@/combinations/combination";
import { Button } from "@/components/ui/button";
import { PanelSheet, usePanel } from "@/components/ui/panel-sheet";
import { Field, INPUT } from "@/components/ui/sheet-form";
import { limitText } from "@/count-text";
import { RequestError } from "@/data/client";
import type { TypeId } from "@/dress/clothing-types";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { useColours } from "@/labels/api";
import { BrandField, useBrandPick } from "@/labels/BrandField";
import { ColourSwatches } from "@/labels/ColourSwatches";
import type { ColourId } from "@/labels/colour";
import { PICTURES_LABEL, PictureSlots } from "@/pictures/PictureSlots";
import { usePictureSlots } from "@/pictures/usePictureSlots";
import { typedPrice } from "@/price";
import {
	useAddOwnedItem,
	useChangeOwnedItem,
	useCloset,
	useDeleteOwnedItem,
} from "./api";
import {
	OWNED_ITEM_LIMIT,
	OWNED_ITEM_NAME_MAX,
	type OwnedItem,
	type OwnedItemId,
	QUANTITY_MAX,
} from "./owned-item";
import { TypeField, TypeOptions } from "./TypeOptions";

// What the form says under its fields.
type Problem = "full" | "failed";

const PROBLEM_TEXT: Record<Problem, string> = {
	full: limitText(OWNED_ITEM_LIMIT, "items"),
	failed: "Not saved. Try again.",
};

// The server's own texts for a name or a price it refuses.
const NAME_CUT = `Name is at most ${OWNED_ITEM_NAME_MAX} characters.`;
const PRICE_CUT = "Price is a whole number of VND from 1 to 999.999.999.";

// The form to add an owned item, a type, a colour, a brand, and a quantity,
// or to change the brand and quantity of the one it is given.
export function OwnedItemSheet(
	props: { onClose: () => void } & (
		| { mode: "add" }
		| { mode: "edit"; item: OwnedItem }
	),
) {
	const { onClose } = props;
	const editing = props.mode === "edit" ? props.item : null;
	const [typeId, setTypeId] = useState<TypeId | null>(editing?.typeId ?? null);
	const [colourId, setColourId] = useState<ColourId | undefined>(
		editing?.colour.id,
	);
	const [quantity, setQuantity] = useState(String(editing?.quantity ?? 1));
	// Set straight, not through panel.change: a change there takes a new id in
	// the add form, and a Save again after a lost answer must keep the id, so
	// the server saves the name and price sent last.
	const [name, setName] = useState(editing?.name ?? "");
	const [nameCut, setNameCut] = useState(false);
	const [price, setPrice] = useState(() =>
		typedPrice(String(editing?.price ?? "")),
	);
	// The text of a paste, for the change that follows it.
	const pasted = useRef<string | undefined>(undefined);
	const colours = useColours();
	const colour = colours.data?.find((c) => c.id === colourId);
	const slots = usePictureSlots(editing?.pictureIds ?? []);
	const first = useRef<HTMLButtonElement>(null);
	const closet = useCloset();
	const add = useAddOwnedItem();
	const update = useChangeOwnedItem();
	const del = useDeleteOwnedItem();
	const sent = editing ? update : add;
	// A new pick in the add form is a new item, so it takes a new id: the
	// server refuses an id it holds for another piece or brand.
	const panel = usePanel<OwnedItemId>({
		id: editing?.id ?? null,
		sent,
		onClose,
		discard: slots.discard,
	});
	const brand = useBrandPick(panel, editing?.brand ?? null);
	const count = Number(quantity) || 0;
	// A change adds no item, so the limit never stops it. A 409
	// owned_item_limit means another tab filled the closet.
	const full =
		!editing &&
		((closet.data?.length ?? 0) >= OWNED_ITEM_LIMIT ||
			(add.error instanceof RequestError &&
				add.error.code === "owned_item_limit"));
	const limitHit =
		sent.error instanceof RequestError && sent.error.code === "picture_limit";
	const problem: Problem | null = full
		? "full"
		: sent.isError && !limitHit
			? "failed"
			: null;
	const save = async () => {
		if (!typeId || !colourId || full || sent.isPending || slots.saving) return;
		const n = Math.max(1, count);
		const pictureIds = await slots.settle();
		if (pictureIds === null) return;
		const { brandId } = brand;
		const named = { name: name.trim() || null, price: price.value };
		if (editing)
			update.mutate(
				{ id: panel.id, brandId, quantity: n, ...named, pictureIds },
				{ onSuccess: () => panel.done("Changes saved") },
			);
		else
			add.mutate(
				{
					id: panel.id,
					typeId,
					colourId,
					brandId,
					quantity: n,
					...named,
					pictureIds,
				},
				{ onSuccess: () => panel.done("Added to your closet") },
			);
	};

	return (
		<PanelSheet
			panel={panel}
			title={editing ? "Edit item" : "Add to closet"}
			focus={first}
			steps={{
				types: {
					title: "Pick a type",
					body: <TypeOptions onPick={panel.pick(setTypeId)} />,
				},
				brands: brand.step,
			}}
			problem={problem && PROBLEM_TEXT[problem]}
			save={{
				disabled:
					!typeId || !colourId || full || sent.isPending || slots.saving,
				run: () => void save(),
			}}
			remove={
				editing
					? {
							title: "Remove this item?",
							text: `${pieceName(editing)} · ${editing.brand?.name ?? "No brand"}`,
							deleted: "Removed from your closet",
							del,
						}
					: undefined
			}
		>
			{editing ? (
				<p className="flex min-w-0 items-center gap-1.5 text-[14px]">
					<TypeFigure typeId={editing.typeId} />
					<span className="truncate">{pieceName(editing)}</span>
				</p>
			) : (
				<>
					<TypeField
						ref={first}
						typeId={typeId}
						onOpen={() => panel.open("types")}
					/>
					<Field label="Colour">
						<ColourSwatches
							value={colourId}
							onChange={panel.change(setColourId)}
						/>
					</Field>
				</>
			)}
			<Field label="Name" problem={nameCut ? NAME_CUT : undefined}>
				<input
					aria-label="Name"
					autoComplete="off"
					placeholder={
						typeId && colour ? pieceName({ typeId, colour }) : undefined
					}
					value={name}
					onChange={(e) => {
						const typed = e.target.value;
						setName(typed.slice(0, OWNED_ITEM_NAME_MAX));
						setNameCut(typed.length > OWNED_ITEM_NAME_MAX);
					}}
					className={INPUT}
				/>
			</Field>
			<BrandField pick={brand} ref={editing ? first : undefined} />
			<Field label="Quantity">
				<div className="flex items-center gap-2">
					<Button
						type="button"
						size="icon"
						aria-label="Less"
						title="Less"
						disabled={count <= 1}
						onClick={() => setQuantity(String(Math.max(1, count - 1)))}
					>
						<Minus size={16} strokeWidth={1.9} aria-hidden />
					</Button>
					<input
						aria-label="Quantity"
						inputMode="numeric"
						maxLength={2}
						value={quantity}
						onChange={(e) =>
							setQuantity(e.target.value.replace(/\D/g, "").slice(0, 2))
						}
						onBlur={() => setQuantity(String(Math.max(1, count)))}
						autoComplete="off"
						className={cn(INPUT, "w-14 text-center")}
					/>
					<Button
						type="button"
						size="icon"
						aria-label="More"
						title="More"
						disabled={count >= QUANTITY_MAX}
						onClick={() =>
							setQuantity(String(Math.min(QUANTITY_MAX, count + 1)))
						}
					>
						<Plus size={16} strokeWidth={1.9} aria-hidden />
					</Button>
				</div>
			</Field>
			<Field label="Price paid" problem={price.cut ? PRICE_CUT : undefined}>
				<div className="flex items-center gap-2">
					<input
						aria-label="Price paid"
						inputMode="numeric"
						autoComplete="off"
						value={price.shown}
						onPaste={(e) => {
							pasted.current = e.clipboardData.getData("text");
						}}
						onChange={(e) => {
							setPrice(typedPrice(e.target.value, pasted.current));
							pasted.current = undefined;
						}}
						className={cn(INPUT, "min-w-0 flex-1")}
					/>
					<span aria-hidden>₫</span>
				</div>
			</Field>
			<Field label={PICTURES_LABEL}>
				<PictureSlots slots={slots} limitHit={limitHit} />
			</Field>
		</PanelSheet>
	);
}
