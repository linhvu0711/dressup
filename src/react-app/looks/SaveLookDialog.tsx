import { Dialog } from "radix-ui";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { modeById } from "@/dress/modes";
import type { DressState } from "@/dress/state";
import { useSaveLook } from "./api";
import { LOOK_NAME_MAX, type LookId, lookFromDress } from "./look";

// The save form of docs/prototype/dressup.html:930-939, with no tags (#15).
export function SaveLookDialog({
	state,
	onClose,
}: {
	state: DressState;
	onClose: () => void;
}) {
	// One id for this form, so a Save after a failed Save that did reach the
	// server writes the same look again rather than a second one.
	const [id] = useState(() => crypto.randomUUID() as LookId);
	const [name, setName] = useState("");
	const box = useRef<HTMLInputElement>(null);
	const save = useSaveLook();
	const toast = useToast();

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
						Save look
					</Dialog.Title>
					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							save.mutate(lookFromDress(state, id, name), {
								onSuccess: () => {
									toast("Saved to Looks");
									onClose();
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
						{save.isError ? (
							<p role="alert" className="text-[13px] text-destructive">
								Not saved. Try again.
							</p>
						) : null}
						<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
							<Button type="button" onClick={onClose}>
								Cancel
							</Button>
							<Button type="submit" variant="primary" disabled={save.isPending}>
								Save
							</Button>
						</div>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
