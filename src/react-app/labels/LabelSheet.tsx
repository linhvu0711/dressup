import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Dialog } from "radix-ui";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { RequestError } from "@/data/client";
import type { ErrorCode } from "@/data/contract";
import { sameLabelName } from "./name";

// What one kind of label calls things in its sheet.
export type LabelWords = {
	addTitle: string;
	editTitle: string;
	addLabel: string;
	confirmTitle: (name: string) => string;
	confirmText: string;
	// What the confirm step says in place of confirmText when the label is in
	// use; a kind with no such rule leaves it out.
	inUseText?: string;
	taken: string;
	full: string;
	added: string;
	deleted: string;
};

// What the form says under its fields: a check the page makes before it
// sends, or the server's refusal.
type Problem = "empty" | "taken" | "full" | "failed";

// The form to add a label, or to change the one it is given: a name and the
// kind's own fields. Delete swaps the same sheet to its confirm step; the
// form stays mounted behind it, so Back finds the typed values.
export function LabelSheet<Id extends string>({
	words,
	labels,
	limit,
	limitCode,
	inUseCode,
	nameMax,
	editing,
	extra,
	onSave,
	onDelete,
	onClose,
}: {
	words: LabelWords;
	labels: readonly { id: Id; name: string }[];
	limit: number;
	limitCode: ErrorCode;
	// The server's refusal to delete a label in use.
	inUseCode?: ErrorCode;
	nameMax: number;
	editing: { id: Id; name: string; inUse?: boolean } | null;
	// The kind's fields under the name; Save stays off until they are ready.
	extra?: { ready: boolean; field: (submit: () => void) => ReactNode };
	onSave: (name: string) => Promise<unknown>;
	onDelete: (id: Id) => Promise<unknown>;
	onClose: () => void;
}) {
	const [name, setName] = useState(editing?.name ?? "");
	const [checked, setChecked] = useState<Problem | null>(null);
	const [step, setStep] = useState<"form" | "confirm">("form");
	const box = useRef<HTMLInputElement>(null);
	const save = useMutation({ mutationFn: onSave });
	const del = useMutation({ mutationFn: onDelete });
	const toast = useToast();
	const ready = extra?.ready ?? true;
	// The list can be older than the server, so a refused delete counts too.
	const inUse =
		editing?.inUse ||
		(inUseCode !== undefined &&
			del.error instanceof RequestError &&
			del.error.code === inUseCode);
	// A change adds no label, so the limit never stops it.
	const full = !editing && labels.length >= limit;
	const sentProblem = (error: unknown): Problem => {
		if (error instanceof RequestError && error.code === "duplicate")
			return "taken";
		if (error instanceof RequestError && error.code === limitCode)
			return "full";
		return "failed";
	};
	const problem =
		checked ?? (full ? "full" : save.isError ? sentProblem(save.error) : null);
	const problemText: Record<Problem, string> = {
		empty: "Enter a name.",
		taken: words.taken,
		full: words.full,
		failed: "Not saved. Try again.",
	};

	const submit = () => {
		if (!ready || full || save.isPending) return;
		const trimmed = name.trim();
		if (!trimmed) return setChecked("empty");
		if (
			labels.some((l) => l.id !== editing?.id && sameLabelName(l.name, trimmed))
		)
			return setChecked("taken");
		save.mutate(trimmed, {
			onSuccess: () => {
				toast(editing ? "Changes saved" : words.added);
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
					{editing && step === "confirm" ? (
						<div className="flex items-center gap-3">
							<Button
								variant="icon"
								size="icon"
								aria-label="Back"
								title="Back"
								onClick={() => {
									setStep("form");
									del.reset();
								}}
							>
								<ArrowLeft size={18} strokeWidth={1.9} aria-hidden />
							</Button>
							<Dialog.Title className="min-w-0 text-[25px] leading-tight">
								{words.confirmTitle(editing.name)}
							</Dialog.Title>
						</div>
					) : (
						<Dialog.Title className="text-[25px] leading-tight">
							{editing ? words.editTitle : words.addTitle}
						</Dialog.Title>
					)}
					<form
						hidden={step === "confirm"}
						className="flex flex-col gap-4 [&[hidden]]:hidden"
						onSubmit={(e) => {
							e.preventDefault();
							submit();
						}}
					>
						<div className="flex flex-col gap-1.5">
							<label
								htmlFor="label-name"
								className="font-medium text-[12.5px] text-muted-foreground"
							>
								Name
							</label>
							<input
								ref={box}
								id="label-name"
								value={name}
								onChange={(e) => {
									setName(e.target.value);
									setChecked(null);
									save.reset();
								}}
								maxLength={nameMax}
								autoComplete="off"
								className="h-10 min-w-0 rounded-[12px] border border-input bg-card px-3 text-[14px] outline-none focus-visible:border-ring"
							/>
						</div>
						{extra?.field(submit)}
						{problem ? (
							<p role="alert" className="text-[13px] text-destructive">
								{problemText[problem]}
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
							<Button type="button" onClick={onClose}>
								Cancel
							</Button>
							<Button
								type="submit"
								variant="primary"
								disabled={!ready || full || save.isPending}
							>
								{editing ? "Save" : words.addLabel}
							</Button>
						</div>
					</form>
					{editing && step === "confirm" ? (
						<>
							<p className="text-muted-foreground">
								{inUse ? words.inUseText : words.confirmText}
							</p>
							{del.isError && !inUse ? (
								<p role="alert" className="text-[13px] text-destructive">
									Not deleted. Try again.
								</p>
							) : null}
							{inUse ? null : (
								<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
									<Button
										variant="destructive"
										disabled={del.isPending}
										onClick={() =>
											del.mutate(editing.id, {
												onSuccess: () => {
													toast(words.deleted);
													onClose();
												},
											})
										}
									>
										Delete
									</Button>
								</div>
							)}
						</>
					) : null}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
