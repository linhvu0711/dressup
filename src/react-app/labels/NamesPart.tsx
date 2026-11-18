import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { LIST } from "./list";

type Named = { id: string; name: string };

function NameRow<T extends Named>({
	label,
	note,
	onOpen,
}: {
	label: T;
	note?: (label: T) => string;
	onOpen: () => void;
}) {
	return (
		<li className="flex min-h-[58px] min-w-0 items-center border-b border-border py-[11px]">
			<button
				type="button"
				aria-label={label.name}
				onClick={onOpen}
				className="flex w-full min-w-0 items-center gap-3 text-left"
			>
				<span className="truncate text-[14px]">{label.name}</span>
				<span className="flex-1" />
				{note ? (
					<span
						data-slot="label-note"
						className="flex-none text-[12.5px] text-muted-foreground"
					>
						{note(label)}
					</span>
				) : null}
				<ChevronRight
					size={18}
					className="flex-none text-muted-foreground"
					aria-hidden
				/>
			</button>
		</li>
	);
}

// One part of the Labels page for a kind of label that is a name alone, as
// brands and tags, in the list's own order, and the form to add or change
// one.
export function NamesPart<T extends Named>({
	query,
	slot,
	words,
	note,
	adding,
	onAddClose,
	sheet,
}: {
	query: UseQueryResult<T[]>;
	// Names the list and its loading rows: `${slot}-list`.
	slot: string;
	words: { failed: string; empty: string; emptyLine: string };
	// A short line at the end of each row.
	note?: (label: T) => string;
	adding: boolean;
	onAddClose: () => void;
	sheet: (labels: T[], editing: T | null, onClose: () => void) => ReactNode;
}) {
	const [editing, setEditing] = useState<T | null>(null);
	return (
		<>
			{query.isPending ? (
				<ul data-slot={`${slot}-list-loading`} className={LIST}>
					{Array.from({ length: 6 }, (_, i) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: the rows are all alike and never move.
							key={i}
							className="flex min-h-[58px] items-center border-b border-border py-[11px]"
						>
							<span
								className={cn("h-3.5 w-[40%] rounded-[6px]", PLACEHOLDER)}
							/>
						</li>
					))}
				</ul>
			) : query.isError ? (
				// Checked before the data: a failed refetch keeps the old labels.
				<Notice title={words.failed}>
					<Button className="mt-2" onClick={() => void query.refetch()}>
						Retry
					</Button>
				</Notice>
			) : query.data.length === 0 ? (
				<Notice title={words.empty}>
					<p className="max-w-[30ch] text-muted-foreground">
						{words.emptyLine}
					</p>
				</Notice>
			) : (
				<ul data-slot={`${slot}-list`} className={LIST}>
					{query.data.map((label) => (
						<NameRow
							key={label.id}
							label={label}
							note={note}
							onOpen={() => setEditing(label)}
						/>
					))}
				</ul>
			)}
			{(adding || editing) && query.data
				? sheet(query.data, editing, () => {
						setEditing(null);
						onAddClose();
					})
				: null}
		</>
	);
}
