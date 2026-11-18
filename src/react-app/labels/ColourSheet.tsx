import { ArrowLeft } from "lucide-react";
import { Dialog } from "radix-ui";
import { useRef, useState } from "react";
import { ColourField } from "@/colour/ColourPicker";
import type { Hex } from "@/colour/hex";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { RequestError } from "@/data/client";
import { useAddColour, useChangeColour, useDeleteColour } from "./api";
import {
	COLOUR_LIMIT,
	COLOUR_NAME_MAX,
	type Colour,
	sameColourName,
} from "./colour";

const START: Hex = "#1F3A5F";

const LIMIT_TEXT = `You have ${COLOUR_LIMIT} colours. That is the limit. Delete one to add a new one.`;

// What the form says under its fields: a check the page makes before it
// sends, or the server's refusal.
type Problem = "empty" | "taken" | "full" | "failed";

const PROBLEM_TEXT: Record<Problem, string> = {
	empty: "Enter a name.",
	taken: "You have this colour already.",
	full: LIMIT_TEXT,
	failed: "Not saved. Try again.",
};

function sentProblem(error: unknown): Problem {
	if (error instanceof RequestError && error.code === "duplicate")
		return "taken";
	if (error instanceof RequestError && error.code === "colour_limit")
		return "full";
	return "failed";
}

// The form to add a colour, or to change the one it is given: a name and
// the colour field. Delete swaps the same sheet to its confirm step; the form
// stays mounted behind it, so Back finds the typed values.
export function ColourSheet({
	colours,
	editing,
	onClose,
}: {
	colours: Colour[];
	editing: Colour | null;
	onClose: () => void;
}) {
	const [name, setName] = useState(editing?.name ?? "");
	const [hex, setHex] = useState<Hex | null>(editing?.hex ?? START);
	const [checked, setChecked] = useState<Problem | null>(null);
	const [step, setStep] = useState<"form" | "confirm">("form");
	const box = useRef<HTMLInputElement>(null);
	const add = useAddColour();
	const change = useChangeColour();
	const save = editing ? change : add;
	const del = useDeleteColour();
	const toast = useToast();
	// A change adds no colour, so the limit never stops it.
	const full = !editing && colours.length >= COLOUR_LIMIT;
	const problem =
		checked ?? (full ? "full" : save.isError ? sentProblem(save.error) : null);

	const submit = (code: Hex | null) => {
		if (!code || full || save.isPending) return;
		const trimmed = name.trim();
		if (!trimmed) return setChecked("empty");
		if (
			colours.some(
				(c) => c.id !== editing?.id && sameColourName(c.name, trimmed),
			)
		)
			return setChecked("taken");
		const done = (text: string) => () => {
			toast(text);
			onClose();
		};
		if (editing)
			change.mutate(
				{ id: editing.id, name: trimmed, hex: code },
				{ onSuccess: done("Changes saved") },
			);
		else
			add.mutate(
				{ name: trimmed, hex: code },
				{ onSuccess: done("Colour added") },
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
								Delete the colour "{editing.name}"?
							</Dialog.Title>
						</div>
					) : (
						<Dialog.Title className="text-[25px] leading-tight">
							{editing ? "Edit colour" : "Add a colour"}
						</Dialog.Title>
					)}
					<form
						hidden={step === "confirm"}
						className="flex flex-col gap-4 [&[hidden]]:hidden"
						onSubmit={(e) => {
							e.preventDefault();
							submit(hex);
						}}
					>
						<div className="flex flex-col gap-1.5">
							<label
								htmlFor="colour-name"
								className="font-medium text-[12.5px] text-muted-foreground"
							>
								Name
							</label>
							<input
								ref={box}
								id="colour-name"
								value={name}
								onChange={(e) => {
									setName(e.target.value);
									setChecked(null);
									save.reset();
								}}
								maxLength={COLOUR_NAME_MAX}
								autoComplete="off"
								className="h-10 min-w-0 rounded-[12px] border border-input bg-card px-3 text-[14px] outline-none focus-visible:border-ring"
							/>
						</div>
						<ColourField
							start={editing?.hex ?? START}
							onChange={setHex}
							onEnter={submit}
						/>
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
							<Button type="button" onClick={onClose}>
								Cancel
							</Button>
							<Button
								type="submit"
								variant="primary"
								disabled={!hex || full || save.isPending}
							>
								{editing ? "Save" : "Add"}
							</Button>
						</div>
					</form>
					{editing && step === "confirm" ? (
						<>
							<p className="text-muted-foreground">
								It goes from your list of colours.
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
												toast("Colour deleted");
												onClose();
											},
										})
									}
								>
									Delete
								</Button>
							</div>
						</>
					) : null}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
