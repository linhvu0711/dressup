import { useIsMutating } from "@tanstack/react-query";
import { Dialog } from "radix-ui";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { keys, RequestError } from "@/data/client";
import { modeById } from "@/dress/modes";
import type { DressState } from "@/dress/state";
import { TagPicker } from "@/tags/TagPicker";
import type { TagId } from "@/tags/tag";
import { LookGone, useLooks, useSaveLook, useUpdateLook } from "./api";
import { useLeaveGoneLook } from "./gone";
import {
	LOOK_LIMIT,
	LOOK_NAME_MAX,
	type Look,
	type LookId,
	lookFromDress,
} from "./look";

// The save form, with its tag chips.
// In the edit state it changes the look, or saves a copy with "Save as new".
// Either ends the edit state and keeps the colours.
export function SaveLookDialog({
	state,
	editing,
	onSaved,
	onClose,
}: {
	state: DressState;
	editing: Look | null;
	onSaved: () => void;
	onClose: () => void;
}) {
	// One id for this form, so a Save after a failed Save that did reach the
	// server writes the same look again rather than a second one.
	const [id] = useState(() => crypto.randomUUID() as LookId);
	const [name, setName] = useState(editing?.name ?? "");
	const [tags, setTags] = useState<TagId[]>(editing?.tags ?? []);
	const box = useRef<HTMLInputElement>(null);
	const save = useSaveLook();
	const update = useUpdateLook();
	const looks = useLooks();
	const toast = useToast();
	const leaveGoneLook = useLeaveGoneLook();
	// A Save before a new tag is stored would leave that tag off the look.
	const addingTag = useIsMutating({ mutationKey: keys.addTag }) > 0;
	// "Save as new" is off with Save; "Save changes" keeps the same id and is
	// not counted. A 409 look_limit means another tab filled the account.
	const full =
		(looks.data?.length ?? 0) >= LOOK_LIMIT ||
		(save.error instanceof RequestError && save.error.code === "look_limit");
	// "Save changes" adds no look, so the limit cannot explain its failure:
	// that one says "Not saved" even at 300 looks.
	const updateFailed = update.isError && !(update.error instanceof LookGone);
	const alert = updateFailed
		? "failed"
		: full
			? "full"
			: save.isError
				? "failed"
				: null;
	const saveNew = () => {
		// At the limit, saving a new look stops here.
		if (full) return;
		save.mutate(lookFromDress(state, id, name, tags), {
			onSuccess: () => {
				toast("Saved to Looks");
				onSaved();
				onClose();
			},
		});
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
							box.current?.focus();
						}
					}}
					className={SHEET}
				>
					<Dialog.Title className="text-[25px] leading-tight">
						{editing ? "Save changes" : "Save look"}
					</Dialog.Title>
					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							if (!editing) return saveNew();
							update.mutate(lookFromDress(state, editing.id, name, tags), {
								onSuccess: () => {
									toast("Changes saved");
									onSaved();
									onClose();
								},
								onError: (error) => {
									if (!(error instanceof LookGone)) return;
									onClose();
									leaveGoneLook(editing.id);
								},
							});
						}}
					>
						<div className="flex flex-col gap-1.5">
							<label
								htmlFor="look-name"
								className="font-medium text-[12.5px] text-muted-foreground"
							>
								Name{" "}
								<span className="font-normal">(you can leave it empty)</span>
							</label>
							<input
								ref={box}
								id="look-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={LOOK_NAME_MAX}
								autoComplete="off"
								placeholder={modeById(state.modeId).name}
								className="h-10 min-w-0 rounded-[12px] border border-input bg-card px-3 text-[14px] outline-none focus-visible:border-ring"
							/>
						</div>
						<TagPicker picked={tags} onChange={setTags} />
						{alert === "full" ? (
							<p role="alert" className="text-[12.5px] text-destructive">
								You have 300 looks. That is the limit. Delete one to save a new
								one.
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
							{editing ? (
								<Button
									type="button"
									disabled={
										save.isPending || update.isPending || addingTag || full
									}
									onClick={saveNew}
								>
									Save as new
								</Button>
							) : null}
							<Button
								type="submit"
								variant="primary"
								disabled={
									save.isPending ||
									update.isPending ||
									addingTag ||
									(!editing && full)
								}
							>
								{editing ? "Save changes" : "Save"}
							</Button>
						</div>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
