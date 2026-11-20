import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Notice } from "@/components/ui/notice";
import { PageError } from "@/components/ui/page-error";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { ColourSheet } from "./ColourSheet";
import type { Colour, ListedColour } from "./colour";
import { LIST } from "./list";

const SWATCH =
	"size-[34px] flex-none rounded-[10px] shadow-[inset_0_0_0_1px_rgba(110,106,98,.38)] dark:[box-shadow:inset_0_0_0_1px_rgba(244,241,234,.3)]";

function ColourRow({ colour, onOpen }: { colour: Colour; onOpen: () => void }) {
	return (
		<li className="flex min-h-[58px] min-w-0 items-center border-b border-border py-[11px]">
			<button
				type="button"
				aria-label={`${colour.name} ${colour.hex}`}
				onClick={onOpen}
				className="flex w-full min-w-0 items-center gap-3 text-left"
			>
				<span
					data-slot="colour-swatch"
					className={SWATCH}
					style={{ background: colour.hex }}
				/>
				<span className="flex min-w-0 flex-col">
					<span className="truncate text-[14px]">{colour.name}</span>
					<span
						data-slot="colour-code"
						className="font-mono text-[12.5px] text-muted-foreground"
					>
						{colour.hex}
					</span>
				</span>
				<span className="flex-1" />
				<ChevronRight
					size={18}
					className="flex-none text-muted-foreground"
					aria-hidden
				/>
			</button>
		</li>
	);
}

// The account's colours, and the form to add or change one.
export function ColoursPart({
	colours,
	adding,
	onAddClose,
}: {
	colours: UseQueryResult<ListedColour[]>;
	adding: boolean;
	onAddClose: () => void;
}) {
	const [editing, setEditing] = useState<ListedColour | null>(null);
	return (
		<>
			{colours.isPending ? (
				<ul data-slot="colour-list-loading" className={LIST}>
					{Array.from({ length: 6 }, (_, i) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: the rows are all alike and never move.
							key={i}
							className="flex min-h-[58px] items-center gap-3 border-b border-border py-[11px]"
						>
							<span
								className={cn(
									"size-[34px] flex-none rounded-[10px]",
									PLACEHOLDER,
								)}
							/>
							<span className="flex flex-1 flex-col gap-1.5">
								<span
									className={cn("h-3.5 w-[40%] rounded-[6px]", PLACEHOLDER)}
								/>
								<span
									className={cn("h-3 w-[25%] rounded-[6px]", PLACEHOLDER)}
								/>
							</span>
						</li>
					))}
				</ul>
			) : colours.isError ? (
				// Checked before the data: a failed refetch keeps the old colours.
				<PageError
					title="Could not load your colours"
					onRetry={() => void colours.refetch()}
				/>
			) : colours.data.length === 0 ? (
				<Notice title="No colours yet">
					<p className="max-w-[30ch] text-muted-foreground">
						Tap + to add your first colour.
					</p>
				</Notice>
			) : (
				<ul data-slot="colour-list" className={LIST}>
					{colours.data.map((colour) => (
						<ColourRow
							key={colour.id}
							colour={colour}
							onOpen={() => setEditing(colour)}
						/>
					))}
				</ul>
			)}
			{(adding || editing) && colours.data ? (
				<ColourSheet
					colours={colours.data}
					editing={editing}
					onClose={() => {
						setEditing(null);
						onAddClose();
					}}
				/>
			) : null}
		</>
	);
}
