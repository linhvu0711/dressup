import { Dialog } from "radix-ui";
import { useRef, useState } from "react";
import { ColourField } from "@/colour/ColourPicker";
import type { Hex } from "@/colour/hex";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { RequestError } from "@/data/client";
import { useAddColour } from "./api";
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

// The form to add a colour: a name and the colour field.
export function ColourSheet({
	colours,
	onClose,
}: {
	colours: Colour[];
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	const [hex, setHex] = useState<Hex | null>(START);
	const [checked, setChecked] = useState<Problem | null>(null);
	const box = useRef<HTMLInputElement>(null);
	const add = useAddColour();
	const toast = useToast();
	const full = colours.length >= COLOUR_LIMIT;
	const problem =
		checked ?? (full ? "full" : add.isError ? sentProblem(add.error) : null);

	const submit = (code: Hex | null) => {
		if (!code || full || add.isPending) return;
		const trimmed = name.trim();
		if (!trimmed) return setChecked("empty");
		if (colours.some((c) => sameColourName(c.name, trimmed)))
			return setChecked("taken");
		add.mutate(
			{ name: trimmed, hex: code },
			{
				onSuccess: () => {
					toast("Colour added");
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
							box.current?.focus();
						}
					}}
					className={SHEET}
				>
					<Dialog.Title className="text-[25px] leading-tight">
						Add a colour
					</Dialog.Title>
					<form
						className="flex flex-col gap-4"
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
									add.reset();
								}}
								maxLength={COLOUR_NAME_MAX}
								autoComplete="off"
								className="h-10 min-w-0 rounded-[12px] border border-input bg-card px-3 text-[14px] outline-none focus-visible:border-ring"
							/>
						</div>
						<ColourField start={START} onChange={setHex} onEnter={submit} />
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
								disabled={!hex || full || add.isPending}
							>
								Add
							</Button>
						</div>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
