import { cn } from "cn";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { useColours } from "@/labels/api";
import { ColourSheet } from "@/labels/ColourSheet";
import type { Colour } from "@/labels/colour";
import { PageHeader } from "../shell/PageHeader";

const SWATCH =
	"size-[34px] flex-none rounded-[10px] shadow-[inset_0_0_0_1px_rgba(110,106,98,.38)] dark:[box-shadow:inset_0_0_0_1px_rgba(244,241,234,.3)]";

const LIST =
	"min-h-0 flex-1 overflow-auto px-4 pb-24 wide:mx-auto wide:w-full wide:max-w-[540px]";

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

// The lists the account makes once and uses everywhere; colours for now.
export function LabelsPage() {
	const colours = useColours();
	// The open form: null for none, "add" for a new colour, else the colour
	// it changes.
	const [open, setOpen] = useState<Colour | "add" | null>(null);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				title="Labels"
				end={
					<Button
						variant="primary"
						size="icon"
						aria-label="Add a colour"
						title="Add a colour"
						disabled={!colours.data}
						onClick={() => setOpen("add")}
					>
						<Plus size={18} strokeWidth={1.9} aria-hidden />
					</Button>
				}
			/>
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
				<Notice title="Could not load your colours">
					<Button className="mt-2" onClick={() => void colours.refetch()}>
						Retry
					</Button>
				</Notice>
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
							onOpen={() => setOpen(colour)}
						/>
					))}
				</ul>
			)}
			{open && colours.data ? (
				<ColourSheet
					colours={colours.data}
					editing={open === "add" ? null : open}
					onClose={() => setOpen(null)}
				/>
			) : null}
		</div>
	);
}
