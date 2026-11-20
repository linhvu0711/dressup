import { type ReactNode, type RefObject, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormSheet } from "@/components/ui/sheet-form";
import { useToast } from "@/components/ui/toast";
import { nextPanel, type PanelEvent, type PanelState } from "./panel";

// A step that swaps in over the form, such as a list to pick from.
export type PanelStepView = { title: string; body: ReactNode };

// The state of an add or change panel. `id` is the record a change panel
// edits, or null for an add panel. `sent` is the panel's save, so a new
// try clears its last refusal. `discard` throws away what was picked in
// the panel and never saved.
export function usePanel<Id extends string>({
	id,
	sent,
	onClose,
	discard,
}: {
	id: Id | null;
	sent: { reset: () => void };
	onClose: () => void;
	discard?: () => void;
}) {
	const fresh = id === null ? () => crypto.randomUUID() as Id : null;
	const [state, setState] = useState<PanelState<Id>>(() => ({
		id: id ?? (crypto.randomUUID() as Id),
		step: "form",
	}));
	const [checked, setChecked] = useState<string | null>(null);
	const toast = useToast();
	// Each move reads the state it follows, so two in one handler never undo
	// each other.
	const send = (event: PanelEvent) =>
		setState((s) => nextPanel(s, event, fresh).state);
	// A new value is a new try, so the last refusal no longer holds.
	const tried =
		(type: "change" | "pick") =>
		<T,>(set: (value: T) => void) =>
		(value: T) => {
			set(value);
			send({ type });
			setChecked(null);
			sent.reset();
		};
	const done = (message: string) => {
		toast(message);
		onClose();
	};
	return {
		id: state.id,
		step: state.step,
		open: (step: string) => send({ type: "open", step }),
		back: () => send({ type: "back" }),
		change: tried("change"),
		// A pick from a list step is a new try that also goes back to the form.
		pick: tried("pick"),
		// What a check the page makes before it sends found wrong.
		checked,
		check: (text: string) => setChecked(text),
		done,
		close: () => {
			discard?.();
			onClose();
		},
	};
}

export type Panel<Id extends string> = ReturnType<typeof usePanel<Id>>;

// The form of an add or change panel in a sheet: the panel's fields, its
// problem line, Cancel and Save. A step from `steps` swaps in over the
// form; the form stays mounted behind it, so Back finds what was typed.
export function PanelSheet<Id extends string>({
	panel,
	title,
	focus,
	steps = {},
	problem,
	problemAction,
	save,
	children,
}: {
	panel: Panel<Id>;
	title: string;
	focus: RefObject<HTMLElement | null>;
	steps?: Record<string, PanelStepView>;
	problem: string | null;
	// A button beside the problem line, such as a link to what the save hit.
	problemAction?: ReactNode;
	save: { label?: string; disabled: boolean; run: () => void };
	children: ReactNode;
}) {
	const open = panel.step === "form" ? null : steps[panel.step];
	const shown = panel.checked ?? problem;
	const line = shown ? (
		<p role="alert" className="text-[13px] text-destructive">
			{shown}
		</p>
	) : null;
	return (
		<FormSheet
			title={title}
			step={open?.title ?? null}
			onBack={panel.back}
			focus={focus}
			onClose={panel.close}
		>
			<form
				hidden={panel.step !== "form"}
				noValidate
				className="flex flex-col gap-4 [&[hidden]]:hidden"
				onSubmit={(e) => {
					e.preventDefault();
					save.run();
				}}
			>
				{children}
				{line && problemAction ? (
					<div className="flex items-center gap-3">
						{line}
						{problemAction}
					</div>
				) : (
					line
				)}
				<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
					<Button type="button" onClick={panel.close}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={save.disabled}>
						{save.label ?? "Save"}
					</Button>
				</div>
			</form>
			{open?.body}
		</FormSheet>
	);
}
