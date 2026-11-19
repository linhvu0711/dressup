import { ChevronRight, Minus, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { pieceName } from "@/combinations/combination";
import { Button } from "@/components/ui/button";
import { Field, FormSheet, ROW } from "@/components/ui/sheet-form";
import { useToast } from "@/components/ui/toast";
import { RequestError } from "@/data/client";
import type { TypeId } from "@/dress/clothing-types";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { BrandOptions } from "@/labels/BrandOptions";
import type { BrandId } from "@/labels/brand";
import { useBrands } from "@/labels/brand-api";
import { ColourSwatches } from "@/labels/ColourSwatches";
import type { ColourId } from "@/labels/colour";
import { PICTURES_LABEL, PictureSlots } from "@/pictures/PictureSlots";
import { usePictureSlots } from "@/pictures/usePictureSlots";
import {
	useAddOwnedItem,
	useChangeOwnedItem,
	useCloset,
	useDeleteOwnedItem,
} from "./api";
import {
	OWNED_ITEM_LIMIT,
	type OwnedItem,
	type OwnedItemId,
	QUANTITY_MAX,
} from "./owned-item";
import { TypeField, TypeOptions } from "./TypeOptions";

type Step = "form" | "types" | "brands" | "confirm";

// What the form says under its fields.
type Problem = "full" | "duplicate" | "failed";

const STEP_TITLE: Record<Exclude<Step, "form">, string> = {
	types: "Pick a type",
	brands: "Pick a brand",
	confirm: "Remove this item?",
};

const PROBLEM_TEXT: Record<Problem, string> = {
	full: `You have ${OWNED_ITEM_LIMIT} items. That is the limit. Delete one to add a new one.`,
	duplicate: "You have this item already. Change its number.",
	failed: "Not saved. Try again.",
};

// The form to add an owned item, a type, a colour, a brand, and a quantity,
// or to change the brand and quantity of the one it is given. The type and
// brand lists and the delete confirm swap into the same sheet; the form
// stays mounted behind them, so Back finds the picks.
export function OwnedItemSheet(
	props: { onClose: () => void } & (
		| { mode: "add" }
		| { mode: "edit"; item: OwnedItem }
	),
) {
	const { onClose } = props;
	const editing = props.mode === "edit" ? props.item : null;
	// One id for this piece and brand, so a Save after a failed Save that did
	// reach the server gives back the same item rather than a second one. A
	// new pick in the add form is a new item, so it takes a new id: the server
	// refuses an id it holds for another piece or brand.
	const [id, setId] = useState(
		() => editing?.id ?? (crypto.randomUUID() as OwnedItemId),
	);
	const [step, setStep] = useState<Step>("form");
	const [typeId, setTypeId] = useState<TypeId | null>(editing?.typeId ?? null);
	const [colourId, setColourId] = useState<ColourId | undefined>(
		editing?.colour.id,
	);
	const [brandId, setBrandId] = useState<BrandId | null>(
		editing?.brand?.id ?? null,
	);
	const [quantity, setQuantity] = useState(String(editing?.quantity ?? 1));
	const slots = usePictureSlots(editing?.pictureIds ?? []);
	const first = useRef<HTMLButtonElement>(null);
	const closet = useCloset();
	const brands = useBrands();
	const add = useAddOwnedItem();
	const update = useChangeOwnedItem();
	const del = useDeleteOwnedItem();
	const sent = editing ? update : add;
	const toast = useToast();
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
		: sent.error instanceof RequestError && sent.error.code === "duplicate"
			? "duplicate"
			: sent.isError && !limitHit
				? "failed"
				: null;
	// The item's own brand while the brand list loads.
	const brandName =
		brands.data?.find((b) => b.id === brandId)?.name ??
		(brandId !== null && brandId === editing?.brand?.id
			? editing.brand.name
			: undefined);
	// A new pick is a new try, so the last refusal no longer holds.
	const change =
		<T,>(set: (value: T) => void) =>
		(value: T) => {
			set(value);
			if (!editing) setId(crypto.randomUUID() as OwnedItemId);
			sent.reset();
		};
	const back = () => {
		setStep("form");
		del.reset();
	};
	const done = (message: string) => () => {
		toast(message);
		onClose();
	};
	// Nothing picked in the sheet stays unless Save sent it.
	const close = () => {
		slots.discard();
		onClose();
	};
	const save = async () => {
		if (!typeId || !colourId || full || sent.isPending || slots.saving) return;
		const n = Math.max(1, count);
		const pictureIds = await slots.settle();
		if (pictureIds === null) return;
		if (editing)
			update.mutate(
				{ id, brandId, quantity: n, pictureIds },
				{ onSuccess: done("Changes saved") },
			);
		else
			add.mutate(
				{ id, typeId, colourId, brandId, quantity: n, pictureIds },
				{ onSuccess: done("Added to your closet") },
			);
	};

	return (
		<FormSheet
			title={editing ? "Edit item" : "Add to closet"}
			step={step === "form" ? null : STEP_TITLE[step]}
			onBack={back}
			focus={first}
			onClose={close}
		>
			<form
				hidden={step !== "form"}
				className="flex flex-col gap-4 [&[hidden]]:hidden"
				onSubmit={(e) => {
					e.preventDefault();
					void save();
				}}
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
							onOpen={() => setStep("types")}
						/>
						<Field label="Colour">
							<ColourSwatches value={colourId} onChange={change(setColourId)} />
						</Field>
					</>
				)}
				<Field label="Brand">
					<button
						ref={editing ? first : undefined}
						type="button"
						className={ROW}
						onClick={() => setStep("brands")}
					>
						<span className="min-w-0 flex-1 truncate">
							{brandName ?? "No brand"}
						</span>
						<ChevronRight size={16} strokeWidth={1.9} aria-hidden />
					</button>
				</Field>
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
							className="h-10 w-14 rounded-[12px] border border-input bg-card px-3 text-center text-[14px] outline-none focus-visible:border-ring"
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
				<Field label={PICTURES_LABEL}>
					<PictureSlots slots={slots} limitHit={limitHit} />
				</Field>
				{problem ? (
					<p role="alert" className="text-[13px] text-destructive">
						{PROBLEM_TEXT[problem]}
					</p>
				) : null}
				<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
					{editing ? (
						<Button
							type="button"
							variant="destructive"
							onClick={() => setStep("confirm")}
						>
							Delete
						</Button>
					) : null}
					<Button type="button" onClick={close}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						disabled={
							!typeId || !colourId || full || sent.isPending || slots.saving
						}
					>
						Save
					</Button>
				</div>
			</form>
			{step === "types" ? (
				<TypeOptions
					onPick={(option) => {
						change(setTypeId)(option);
						back();
					}}
				/>
			) : null}
			{step === "brands" ? (
				<BrandOptions
					brands={brands}
					onPick={(option) => {
						change(setBrandId)(option);
						back();
					}}
				/>
			) : null}
			{editing && step === "confirm" ? (
				<>
					<p className="text-muted-foreground">
						{pieceName(editing)} · {editing.brand?.name ?? "No brand"}
					</p>
					{del.isError ? (
						<p role="alert" className="text-[13px] text-destructive">
							Not deleted. Try again.
						</p>
					) : null}
					<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
						<Button
							variant="destructive"
							disabled={del.isPending}
							onClick={() =>
								del.mutate(editing.id, {
									onSuccess: () => {
										slots.discard();
										done("Removed from your closet")();
									},
								})
							}
						>
							Delete
						</Button>
					</div>
				</>
			) : null}
		</FormSheet>
	);
}
