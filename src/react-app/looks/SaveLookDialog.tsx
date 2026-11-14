import { Dialog } from "radix-ui";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { modeById } from "@/dress/modes";
import type { DressState } from "@/dress/state";
import { TagPicker } from "@/tags/TagPicker";
import type { TagId } from "@/tags/tag";
import {
	LookGone,
	SaveError,
	useLooks,
	useSaveLook,
	useUpdateLook,
} from "./api";
import { useLeaveGoneLook } from "./gone";
import {
	LOOK_LIMIT,
	LOOK_NAME_MAX,
	type Look,
	type LookId,
	lookFromDress,
} from "./look";

// The save form of docs/prototype/dressup.html:930-939, with the tag chips of
// :935-937.
// In the edit state it changes the look, or saves a copy with "Save as new".
// Either ends the edit state and keeps the colours (:1046-1049).
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
	// "Save as new" is off with Save; "Save changes" keeps the same id and is
	// not counted. A 409 look_limit means another tab filled the account.
	const full =
		(looks.data?.length ?? 0) >= LOOK_LIMIT ||
		(save.error instanceof SaveError && save.error.code === "look_limit");
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
		// The prototype's saveDo stops here at the limit
		// (docs/prototype/dressup.html:1044).
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
				<Dialog.Overlay className="fixed inset-0 z-20 bg-[rgba(20,18,14,.42)]" />
				<Dialog.Content
					aria-describedby={undefined}
					onOpenAutoFocus={(e) => {
						// The phone keeps its keyboard closed until the box is tapped
						// (docs/prototype/dressup.html:974).
						e.preventDefault();
						if (window.matchMedia("(min-width: 56.25rem)").matches) {
							box.current?.focus();
						}
					}}
					className="fixed inset-x-0 bottom-0 z-[21] flex max-h-[88%] flex-col gap-4 overflow-auto rounded-t-[26px] border border-border border-b-0 bg-card p-5 pb-[22px] shadow-float outline-none duration-[260ms] ease-soft data-[state=open]:slide-in-from-bottom-8 data-[state=open]:animate-in wide:inset-x-auto wide:top-1/2 wide:bottom-auto wide:left-1/2 wide:w-[430px] wide:-translate-x-1/2 wide:-translate-y-1/2 wide:rounded-[22px] wide:border-b wide:p-6"
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
									disabled={save.isPending || update.isPending || full}
									onClick={saveNew}
								>
									Save as new
								</Button>
							) : null}
							<Button
								type="submit"
								variant="primary"
								disabled={
									save.isPending || update.isPending || (!editing && full)
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
