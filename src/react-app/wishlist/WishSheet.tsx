import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { TypeField, TypeOptions } from "@/closet/TypeOptions";
import { Button } from "@/components/ui/button";
import { Field, FormSheet } from "@/components/ui/sheet-form";
import { useToast } from "@/components/ui/toast";
import { RequestError } from "@/data/client";
import type { TypeId } from "@/dress/clothing-types";
import { ColourSwatches } from "@/labels/ColourSwatches";
import type { ColourId } from "@/labels/colour";
import { usePieceLink } from "@/shell/piece-link";
import { useAddWish, useWishlist } from "./api";
import { WISH_LIMIT, type WishId } from "./wish";

type Step = "form" | "types";

// What the form says under its fields.
type Problem = "full" | "duplicate" | "failed";

const PROBLEM_TEXT: Record<Exclude<Problem, "duplicate">, string> = {
	full: `You have ${WISH_LIMIT} wishes. That is the limit. Delete one to add a new one.`,
	failed: "Not saved. Try again.",
};

// The form to add a wish: a type and a colour. The type list swaps into the
// same sheet; the form stays mounted behind it, so Back finds the picks.
export function WishSheet({ onClose }: { onClose: () => void }) {
	// One id for this piece, so a Save after a failed Save that did reach the
	// server gives back the same wish rather than a second one. A new pick is
	// a new wish, so it takes a new id.
	const [id, setId] = useState(() => crypto.randomUUID() as WishId);
	const [step, setStep] = useState<Step>("form");
	const [typeId, setTypeId] = useState<TypeId | null>(null);
	const [colourId, setColourId] = useState<ColourId | undefined>();
	const first = useRef<HTMLButtonElement>(null);
	const wishlist = useWishlist();
	const add = useAddWish();
	const toast = useToast();
	const navigate = useNavigate();
	const linkTo = usePieceLink("/wishlist");
	// A 409 wish_limit means another tab filled the wishlist.
	const full =
		(wishlist.data?.length ?? 0) >= WISH_LIMIT ||
		(add.error instanceof RequestError && add.error.code === "wish_limit");
	const problem: Problem | null = full
		? "full"
		: add.error instanceof RequestError && add.error.code === "duplicate"
			? "duplicate"
			: add.isError
				? "failed"
				: null;
	// A new pick is a new try, so the last refusal no longer holds.
	const change =
		<T,>(set: (value: T) => void) =>
		(value: T) => {
			set(value);
			setId(crypto.randomUUID() as WishId);
			add.reset();
		};
	const save = () => {
		if (!typeId || !colourId || full || add.isPending) return;
		add.mutate(
			{ id, typeId, colourId },
			{
				onSuccess: (wish) => {
					toast("Added to your wishlist");
					onClose();
					const link = linkTo(wish);
					navigate(link.to, { state: link.state });
				},
			},
		);
	};
	const piece =
		typeId && colourId ? { typeId, colour: { id: colourId } } : null;

	return (
		<FormSheet
			title="Add to wishlist"
			step={step === "types" ? "Pick a type" : null}
			onBack={() => setStep("form")}
			focus={first}
			onClose={onClose}
		>
			<form
				hidden={step !== "form"}
				className="flex flex-col gap-4 [&[hidden]]:hidden"
				onSubmit={(e) => {
					e.preventDefault();
					save();
				}}
			>
				<TypeField
					ref={first}
					typeId={typeId}
					onOpen={() => setStep("types")}
				/>
				<Field label="Colour">
					<ColourSwatches value={colourId} onChange={change(setColourId)} />
				</Field>
				{problem === "duplicate" && piece ? (
					<div className="flex items-center gap-3">
						<p role="alert" className="text-[13px] text-destructive">
							You have this wish already.
						</p>
						<Button asChild>
							<Link {...linkTo(piece)} onClick={onClose}>
								Open it
							</Link>
						</Button>
					</div>
				) : problem === "full" || problem === "failed" ? (
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
				<TypeOptions
					onPick={(option) => {
						change(setTypeId)(option);
						setStep("form");
					}}
				/>
			) : null}
		</FormSheet>
	);
}
