import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useColours } from "@/labels/api";
import type { Colour } from "@/labels/colour";
import { PageHeader } from "../shell/PageHeader";

const SWATCH =
	"size-[34px] flex-none rounded-[10px] shadow-[inset_0_0_0_1px_rgba(110,106,98,.38)] dark:[box-shadow:inset_0_0_0_1px_rgba(244,241,234,.3)]";

const LIST =
	"min-h-0 flex-1 overflow-auto px-4 pb-24 wide:mx-auto wide:w-full wide:max-w-[540px]";

function ColourRow({ colour }: { colour: Colour }) {
	return (
		<li className="flex min-h-[58px] min-w-0 items-center border-b border-border py-[11px]">
			<button
				type="button"
				aria-label={`${colour.name} ${colour.hex}`}
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
					>
						<Plus size={18} strokeWidth={1.9} aria-hidden />
					</Button>
				}
			/>
			{colours.data ? (
				<ul data-slot="colour-list" className={LIST}>
					{colours.data.map((colour) => (
						<ColourRow key={colour.id} colour={colour} />
					))}
				</ul>
			) : null}
		</div>
	);
}
