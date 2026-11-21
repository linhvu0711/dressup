import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { ColourSheet } from "./ColourSheet";
import type { ListedColour } from "./colour";
import { LabelPart } from "./LabelPart";

const SWATCH =
	"size-[34px] flex-none rounded-[10px] shadow-[inset_0_0_0_1px_rgba(110,106,98,.38)] dark:[box-shadow:inset_0_0_0_1px_rgba(244,241,234,.3)]";

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
	return (
		<LabelPart
			query={colours}
			slot="colour"
			words={{
				failed: "Could not load your colours",
				empty: "No colours yet",
				emptyLine: "Tap + to add your first colour.",
			}}
			loadingRow={
				<>
					<span
						className={cn("size-[34px] flex-none rounded-[10px]", PLACEHOLDER)}
					/>
					<span className="flex flex-1 flex-col gap-1.5">
						<span className={cn("h-3.5 w-[40%] rounded-[6px]", PLACEHOLDER)} />
						<span className={cn("h-3 w-[25%] rounded-[6px]", PLACEHOLDER)} />
					</span>
				</>
			}
			rowLabel={(colour) => `${colour.name} ${colour.hex}`}
			row={(colour) => (
				<>
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
				</>
			)}
			adding={adding}
			onAddClose={onAddClose}
			sheet={(list, editing, onClose) => (
				<ColourSheet colours={list} editing={editing} onClose={onClose} />
			)}
		/>
	);
}
