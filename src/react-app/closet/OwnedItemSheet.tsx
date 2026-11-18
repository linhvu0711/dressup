import { ArrowLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Dialog } from "radix-ui";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { RequestError } from "@/data/client";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { GARMENT_IDS, GARMENT_NAMES, type GarmentId } from "@/dress/garments";
import type { BrandId } from "@/labels/brand";
import { useBrands } from "@/labels/brand-api";
import { ColourSwatches } from "@/labels/ColourSwatches";
import type { ColourId } from "@/labels/colour";
import { useAddOwnedItem, useCloset } from "./api";
import { OWNED_ITEM_LIMIT, type OwnedItemId, QUANTITY_MAX } from "./owned-item";

const LABEL = "font-medium text-[12.5px] text-muted-foreground";

const ROW =
	"flex h-11 min-w-0 items-center gap-2 rounded-[12px] border border-input bg-card px-3 text-left text-[14px] outline-none focus-visible:border-ring";

const LIST_ROW =
	"flex h-11 min-w-0 items-center gap-2.5 rounded-[12px] px-2 text-left text-[14px] hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

type Step = "form" | "types" | "brands";

// What the form says under its fields.
type Problem = "full" | "duplicate" | "failed";

const PROBLEM_TEXT: Record<Problem, string> = {
	full: `You have ${OWNED_ITEM_LIMIT} items. That is the limit. Delete one to add a new one.`,
	duplicate: "You have this item already. Change its number.",
	failed: "Not saved. Try again.",
};

// The form to add an owned item: a type, a colour, a brand, and a quantity.
// The type and brand lists swap into the same sheet; the form stays mounted
// behind them, so Back finds the picks.
export function OwnedItemSheet({
	onClose,
}: {
	mode: "add";
	onClose: () => void;
}) {
	// One id for this form, so a Save after a failed Save that did reach the
	// server gives back the same item rather than a second one.
	const [id] = useState(() => crypto.randomUUID() as OwnedItemId);
	const [step, setStep] = useState<Step>("form");
	const [typeId, setTypeId] = useState<GarmentId | null>(null);
	const [colourId, setColourId] = useState<ColourId | undefined>();
	const [brandId, setBrandId] = useState<BrandId | null>(null);
	const [quantity, setQuantity] = useState("1");
	const first = useRef<HTMLButtonElement>(null);
	const closet = useCloset();
	const brands = useBrands();
	const add = useAddOwnedItem();
	const toast = useToast();
	const count = Number(quantity) || 0;
	// A 409 owned_item_limit means another tab filled the closet.
	const full =
		(closet.data?.length ?? 0) >= OWNED_ITEM_LIMIT ||
		(add.error instanceof RequestError &&
			add.error.code === "owned_item_limit");
	const problem: Problem | null = full
		? "full"
		: add.error instanceof RequestError && add.error.code === "duplicate"
			? "duplicate"
			: add.isError
				? "failed"
				: null;
	const brandName = brands.data?.find((b) => b.id === brandId)?.name;
	// A new pick is a new try, so the last refusal no longer holds.
	const change =
		<T,>(set: (value: T) => void) =>
		(value: T) => {
			set(value);
			add.reset();
		};
	const back = () => setStep("form");
	const save = () => {
		if (!typeId || !colourId || full || add.isPending) return;
		add.mutate(
			{ id, typeId, colourId, brandId, quantity: Math.max(1, count) },
			{
				onSuccess: () => {
					toast("Added to your closet");
					onClose();
				},
			},
		);
	};

	return (
		<Dialog.Root open onOpenChange={(open) => open || onClose()}>
			<Dialog.Portal>
				<Dialog.Overlay className={SHEET_OVERLAY} />
				<Dialog.Content
					aria-describedby={undefined}
					onOpenAutoFocus={(e) => {
						// The phone keeps its keyboard closed until the box is tapped.
						e.preventDefault();
						if (window.matchMedia("(min-width: 56.25rem)").matches) {
							first.current?.focus();
						}
					}}
					className={SHEET}
				>
					{step === "form" ? (
						<Dialog.Title className="text-[25px] leading-tight">
							Add to closet
						</Dialog.Title>
					) : (
						<StepTitle
							title={step === "types" ? "Pick a type" : "Pick a brand"}
							onBack={back}
						/>
					)}
					<form
						hidden={step !== "form"}
						className="flex flex-col gap-4 [&[hidden]]:hidden"
						onSubmit={(e) => {
							e.preventDefault();
							save();
						}}
					>
						<Field label="Type">
							<button
								ref={first}
								type="button"
								className={ROW}
								onClick={() => setStep("types")}
							>
								<span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
									{typeId ? (
										<>
											<TypeFigure typeId={typeId} />
											{GARMENT_NAMES[typeId]}
										</>
									) : (
										<span className="text-muted-foreground">Pick a type</span>
									)}
								</span>
								<ChevronRight size={16} strokeWidth={1.9} aria-hidden />
							</button>
						</Field>
						<Field label="Colour">
							<ColourSwatches value={colourId} onChange={change(setColourId)} />
						</Field>
						<Field label="Brand">
							<button
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
						{problem ? (
							<p role="alert" className="text-[13px] text-destructive">
								{PROBLEM_TEXT[problem]}
							</p>
						) : null}
						<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
							<Button type="button" onClick={onClose}>
								Cancel
							</Button>
							<Button
								type="submit"
								variant="primary"
								disabled={!typeId || !colourId || full || add.isPending}
							>
								Save
							</Button>
						</div>
					</form>
					{step === "types" ? (
						<div className="flex flex-col">
							{GARMENT_IDS.map((option) => (
								<button
									key={option}
									type="button"
									data-slot="type-option"
									className={LIST_ROW}
									onClick={() => {
										change(setTypeId)(option);
										back();
									}}
								>
									<TypeFigure typeId={option} className="size-11 flex-none" />
									{GARMENT_NAMES[option]}
								</button>
							))}
						</div>
					) : null}
					{step === "brands" ? (
						<div className="flex flex-col">
							{[{ id: null, name: "No brand" }, ...(brands.data ?? [])].map(
								(option) => (
									<button
										key={option.id ?? "none"}
										type="button"
										className={LIST_ROW}
										onClick={() => {
											change(setBrandId)(option.id);
											back();
										}}
									>
										{option.name}
									</button>
								),
							)}
						</div>
					) : null}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className={LABEL}>{label}</span>
			{children}
		</div>
	);
}

function StepTitle({ title, onBack }: { title: string; onBack: () => void }) {
	return (
		<div className="flex items-center gap-3">
			<Button
				variant="icon"
				size="icon"
				aria-label="Back"
				title="Back"
				onClick={onBack}
			>
				<ArrowLeft size={18} strokeWidth={1.9} aria-hidden />
			</Button>
			<Dialog.Title className="min-w-0 text-[25px] leading-tight">
				{title}
			</Dialog.Title>
		</div>
	);
}
