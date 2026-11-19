import { useIsMutating } from "@tanstack/react-query";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { keys, RequestError } from "@/data/client";
import type { TypeId } from "@/dress/clothing-types";
import type { Colour } from "@/labels/colour";
import { useTags } from "@/tags/api";
import { TagPicker } from "@/tags/TagPicker";
import type { TagId } from "@/tags/tag";
import {
	CombinationGone,
	useChangeCombination,
	useCombinations,
	useSaveCombination,
} from "./api";
import {
	COMBINATION_LIMIT,
	type Combination,
	type CombinationId,
	combinationKey,
	combinationTitle,
} from "./combination";
import { useLeaveGoneCombination } from "./gone";
import { useWallAddress } from "./wall-address";

// The save form: the title, the tag chips, then Save. A combination the account has already,
// or a full account, turns Save off with a line that says why. With changing,
// it saves the changes to that combination; a change adds no combination, so
// the limit does not apply.
export function SaveCombinationDialog({
	pieces,
	open,
	onClose,
	changing,
}: {
	pieces: readonly { typeId: TypeId; colour: Colour }[];
	open: boolean;
	onClose: () => void;
	changing?: Combination;
}) {
	// One id for this form, so a Save after a failed Save that did reach the
	// server gives back the same combination rather than a refused repeat.
	const [id] = useState(
		() => changing?.id ?? (crypto.randomUUID() as CombinationId),
	);
	const [tags, setTags] = useState<TagId[]>(changing?.tags ?? []);
	const listed = useTags();
	// A Save before a new tag is stored would leave that tag off.
	const addingTag = useIsMutating({ mutationKey: keys.addTag }) > 0;
	const save = useSaveCombination();
	const change = useChangeCombination();
	const send = changing ? change : save;
	const leaveGoneCombination = useLeaveGoneCombination();
	const combinations = useCombinations();
	const toast = useToast();
	const navigate = useNavigate();
	const address = useWallAddress();
	const sent = pieces.map((p) => ({ typeId: p.typeId, colourId: p.colour.id }));
	const key = combinationKey(sent, open);
	const refused = send.error instanceof RequestError ? send.error : null;
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
		!changing &&
		((combinations.data?.length ?? 0) >= COMBINATION_LIMIT ||
			refused?.code === "combination_limit");
	const alert = sameId
		? "duplicate"
		: full
			? "full"
			: send.isError
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
							send.mutate(
								{
									id,
									pieces: sent,
									open,
									// A tag deleted meanwhile is not sent. Tags not loaded send the
									// picks as they are, so Save changes keeps the stored ones.
									tags: listed.data
										? tags.filter((t) => listed.data.some((l) => l.id === t))
										: tags,
								},
								changing
									? {
											onSuccess: () => {
												toast("Changes saved");
												navigate(address.combination(changing.id), {
													replace: true,
												});
											},
											onError: (error) => {
												if (error instanceof CombinationGone)
													leaveGoneCombination();
											},
										}
									: {
											onSuccess: () => {
												toast("Saved to Combinations");
												navigate(address.wall);
											},
										},
							);
						}}
					>
						<p className="text-[17px] leading-snug">
							{combinationTitle({ pieces, open })}
						</p>
						<TagPicker picked={tags} onChange={setTags} />
						{sameId ? (
							<div className="flex items-center gap-3">
								<p role="alert" className="text-[13px] text-destructive">
									You have this combination already.
								</p>
								<Button asChild>
									<Link to={address.combination(sameId)}>Open it</Link>
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
									send.isPending ||
									addingTag ||
									alert === "duplicate" ||
									alert === "full"
								}
							>
								{changing ? "Save changes" : "Save"}
							</Button>
						</div>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
