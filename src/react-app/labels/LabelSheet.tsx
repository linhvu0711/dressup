import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useRef, useState } from "react";
import { PanelSheet, usePanel } from "@/components/ui/panel-sheet";
import { INPUT } from "@/components/ui/sheet-form";
import { isNameTaken, RequestError } from "@/data/client";
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
	added: string;
	// The toast of a Save in the edit sheet.
	changed: string;
	deleted: string;
};

// The form to add a label, or to change the one it is given: a name and the
// kind's own fields.
export function LabelSheet<Id extends string>({
	words,
	labels,
	limit,
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
	// The most labels of this kind, the server's refusal over it, and what the
	// form says then; a kind with no limit leaves it out.
	limit?: { max: number; code: ErrorCode; full: string };
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
	const box = useRef<HTMLInputElement>(null);
	const save = useMutation({ mutationFn: onSave });
	const del = useMutation({ mutationFn: onDelete });
	const panel = usePanel<Id>({ id: editing?.id ?? null, sent: save, onClose });
	const ready = extra?.ready ?? true;
	// The list can be older than the server, so a refused delete counts too.
	const inUse =
		editing?.inUse ||
		(inUseCode !== undefined &&
			del.error instanceof RequestError &&
			del.error.code === inUseCode);
	// A change adds no label, so the limit never stops it.
	const full = !editing && limit !== undefined && labels.length >= limit.max;
	const sentProblem = (error: unknown) => {
		if (isNameTaken(error)) return words.taken;
		if (error instanceof RequestError && error.code === limit?.code)
			return limit.full;
		return "Not saved. Try again.";
	};
	const problem = full
		? (limit?.full ?? null)
		: save.isError
			? sentProblem(save.error)
			: null;

	const submit = () => {
		if (!ready || full || save.isPending) return;
		const trimmed = name.trim();
		if (!trimmed) return panel.check("Enter a name.");
		if (
			labels.some((l) => l.id !== editing?.id && sameLabelName(l.name, trimmed))
		)
			return panel.check(words.taken);
		save.mutate(trimmed, {
			onSuccess: () => panel.done(editing ? words.changed : words.added),
		});
	};

	return (
		<PanelSheet
			panel={panel}
			title={editing ? words.editTitle : words.addTitle}
			focus={box}
			problem={problem}
			save={{
				label: editing ? "Save" : words.addLabel,
				disabled: !ready || full || save.isPending,
				run: submit,
			}}
			remove={
				editing
					? {
							title: words.confirmTitle(editing.name),
							text: inUse ? words.inUseText : words.confirmText,
							deleted: words.deleted,
							del,
							blocked: inUse,
						}
					: undefined
			}
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
					onChange={(e) => panel.change(setName)(e.target.value)}
					maxLength={nameMax}
					autoComplete="off"
					className={INPUT}
				/>
			</div>
			{extra?.field(submit)}
		</PanelSheet>
	);
}
