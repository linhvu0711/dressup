import { Dialog } from "radix-ui";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { RequestError } from "@/data/client";
import type { GarmentId } from "@/dress/garments";
import type { Colour } from "@/labels/colour";
import { useCombinations, useSaveCombination } from "./api";
import {
	COMBINATION_LIMIT,
	type CombinationId,
	combinationKey,
	combinationTitle,
} from "./combination";

// The save form: the title, then Save. A combination the account has already,
// or a full account, turns Save off with a line that says why.
export function SaveCombinationDialog({
	pieces,
	open,
	onClose,
}: {
	pieces: readonly { typeId: GarmentId; colour: Colour }[];
	open: boolean;
	onClose: () => void;
}) {
	// One id for this form, so a Save after a failed Save that did reach the
	// server gives back the same combination rather than a refused repeat.
	const [id] = useState(() => crypto.randomUUID() as CombinationId);
	const save = useSaveCombination();
	const combinations = useCombinations();
	const toast = useToast();
	const navigate = useNavigate();
	const sent = pieces.map((p) => ({ typeId: p.typeId, colourId: p.colour.id }));
	const key = combinationKey(sent, open);
	const refused = save.error instanceof RequestError ? save.error : null;
	const sameId =
		combinations.data?.find(
			(c) =>
				c.id !== id &&
				combinationKey(
					c.pieces.map((p) => ({ typeId: p.typeId, colourId: p.colour.id })),
					c.open,
				) === key,
		)?.id ?? (refused?.code === "duplicate" ? refused.id : null);
	const full =
		(combinations.data?.length ?? 0) >= COMBINATION_LIMIT ||
		refused?.code === "combination_limit";
	const alert = sameId
		? "duplicate"
		: full
			? "full"
			: save.isError
				? "failed"
				: null;
	return (
		<Dialog.Root open onOpenChange={(isOpen) => isOpen || onClose()}>
			<Dialog.Portal>
				<Dialog.Overlay className={SHEET_OVERLAY} />
				<Dialog.Content aria-describedby={undefined} className={SHEET}>
					<Dialog.Title className="text-[25px] leading-tight">
						Save combination
					</Dialog.Title>
					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							if (alert === "duplicate" || alert === "full") return;
							save.mutate(
								{ id, pieces: sent, open },
								{
									onSuccess: () => {
										toast("Saved to Combinations");
										navigate("/combinations");
									},
								},
							);
						}}
					>
						<p className="text-[17px] leading-snug">
							{combinationTitle({ pieces, open })}
						</p>
						{alert === "duplicate" ? (
							<div className="flex items-center gap-3">
								<p role="alert" className="text-[13px] text-destructive">
									You have this combination already.
								</p>
								<Button asChild>
									<Link to={`/combinations/${sameId}`}>Open it</Link>
								</Button>
							</div>
						) : alert === "full" ? (
							<p role="alert" className="text-[12.5px] text-destructive">
								You have 300 combinations. That is the limit. Delete one to save
								a new one.
							</p>
						) : alert === "failed" ? (
							<p role="alert" className="text-[13px] text-destructive">
								Not saved. Try again.
							</p>
						) : null}
						<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
							<Button type="button" onClick={onClose}>
								Cancel
							</Button>
							<Button
								type="submit"
								variant="primary"
								disabled={
									save.isPending || alert === "duplicate" || alert === "full"
								}
							>
								Save
							</Button>
						</div>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
