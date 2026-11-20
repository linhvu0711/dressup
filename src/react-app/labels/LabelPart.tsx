import type { UseQueryResult } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Notice } from "@/components/ui/notice";
import { PageError } from "@/components/ui/page-error";

const LIST =
	"min-h-0 flex-1 overflow-auto px-4 pb-24 wide:mx-auto wide:w-full wide:max-w-[540px]";

// One part of the Labels page: the list of one kind of label while it loads,
// fails, is empty, or holds labels, and the form to add or change one.
export function LabelPart<T extends { id: string }>({
	query,
	slot,
	words,
	loadingRow,
	rowLabel,
	row,
	adding,
	onAddClose,
	sheet,
}: {
	query: UseQueryResult<T[]>;
	// Names the list and its loading rows: `${slot}-list`.
	slot: string;
	words: { failed: string; empty: string; emptyLine: string };
	loadingRow: ReactNode;
	rowLabel: (label: T) => string;
	row: (label: T) => ReactNode;
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
							className="flex min-h-[58px] items-center gap-3 border-b border-border py-[11px]"
						>
							{loadingRow}
						</li>
					))}
				</ul>
			) : query.isError ? (
				// Checked before the data: a failed refetch keeps the old labels.
				<PageError title={words.failed} onRetry={() => void query.refetch()} />
			) : query.data.length === 0 ? (
				<Notice title={words.empty}>
					<p className="max-w-[30ch] text-muted-foreground">
						{words.emptyLine}
					</p>
				</Notice>
			) : (
				<ul data-slot={`${slot}-list`} className={LIST}>
					{query.data.map((label) => (
						<li
							key={label.id}
							className="flex min-h-[58px] min-w-0 items-center border-b border-border py-[11px]"
						>
							<button
								type="button"
								aria-label={rowLabel(label)}
								onClick={() => setEditing(label)}
								className="flex w-full min-w-0 items-center gap-3 text-left"
							>
								{row(label)}
								<ChevronRight
									size={18}
									className="flex-none text-muted-foreground"
									aria-hidden
								/>
							</button>
						</li>
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
