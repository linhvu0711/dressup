import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";
import type { ReactNode } from "react";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { LabelPart } from "./LabelPart";

type Named = { id: string; name: string };

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
	return (
		<LabelPart
			query={query}
			slot={slot}
			words={words}
			loadingRow={
				<span className={cn("h-3.5 w-[40%] rounded-[6px]", PLACEHOLDER)} />
			}
			rowLabel={(label) => label.name}
			row={(label) => (
				<>
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
				</>
			)}
			adding={adding}
			onAddClose={onAddClose}
			sheet={sheet}
		/>
	);
}
