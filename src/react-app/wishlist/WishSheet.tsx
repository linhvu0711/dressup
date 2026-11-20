import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { TypeField, TypeOptions } from "@/closet/TypeOptions";
import { Button } from "@/components/ui/button";
import { PanelSheet, usePanel } from "@/components/ui/panel-sheet";
import { Field } from "@/components/ui/sheet-form";
import { limitText } from "@/count-text";
import { RequestError } from "@/data/client";
import type { TypeId } from "@/dress/clothing-types";
import { ColourSwatches } from "@/labels/ColourSwatches";
import type { ColourId } from "@/labels/colour";
import { usePieceLink } from "@/shell/piece-link";
import { useAddWish, useWishlist } from "./api";
import { WISH_LIMIT, type WishId } from "./wish";

// What the form says under its fields.
type Problem = "full" | "duplicate" | "failed";

const PROBLEM_TEXT: Record<Problem, string> = {
	full: limitText(WISH_LIMIT, "wishes"),
	duplicate: "You have this wish already.",
	failed: "Not saved. Try again.",
};

// The form to add a wish: a type and a colour. The type list swaps into the
// same sheet.
export function WishSheet({ onClose }: { onClose: () => void }) {
	const [typeId, setTypeId] = useState<TypeId | null>(null);
	const [colourId, setColourId] = useState<ColourId | undefined>();
	const first = useRef<HTMLButtonElement>(null);
	const wishlist = useWishlist();
	const add = useAddWish();
	const panel = usePanel<WishId>({ id: null, sent: add, onClose });
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
	const save = () => {
		if (!typeId || !colourId || full || add.isPending) return;
		add.mutate(
			{ id: panel.id, typeId, colourId },
			{
				onSuccess: (wish) => {
					panel.done("Added to your wishlist");
					const link = linkTo(wish);
					navigate(link.to, { state: link.state });
				},
			},
		);
	};
	const piece =
		typeId && colourId ? { typeId, colour: { id: colourId } } : null;

	return (
		<PanelSheet
			panel={panel}
			title="Add to wishlist"
			focus={first}
			steps={{
				types: {
					title: "Pick a type",
					body: <TypeOptions onPick={panel.pick(setTypeId)} />,
				},
			}}
			problem={
				problem === "duplicate" && !piece
					? null
					: problem && PROBLEM_TEXT[problem]
			}
			problemAction={
				problem === "duplicate" && piece ? (
					<Button asChild>
						<Link {...linkTo(piece)} onClick={onClose}>
							Open it
						</Link>
					</Button>
				) : undefined
			}
			save={{
				disabled: !typeId || !colourId || full || add.isPending,
				run: save,
			}}
		>
			<TypeField
				ref={first}
				typeId={typeId}
				onOpen={() => panel.open("types")}
			/>
			<Field label="Colour">
				<ColourSwatches value={colourId} onChange={panel.change(setColourId)} />
			</Field>
		</PanelSheet>
	);
}
