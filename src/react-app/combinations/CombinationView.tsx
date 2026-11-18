import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useDressState } from "@/dress/DressState";
import { LAYER_OF } from "@/dress/garments";
import { OutfitFailed } from "@/dress/OutfitFailed";
import { Stage } from "@/dress/Stage";
import { CombinationFigure } from "./CombinationFigure";
import {
	type Combination,
	combinationTitle,
	pieceName,
	topFirst,
} from "./combination";

// The open combination. Under 900 px it is the combination's own page, its
// head row on top with Back; from 900 px it is the right part of the
// Combinations page, the head row under the stage.
export function CombinationView({
	combination,
	onDelete,
}: {
	combination: Combination;
	onDelete: () => void;
}) {
	const toast = useToast();
	const dress = useDressState();
	const title = combinationTitle(combination);
	return (
		<div data-slot="combination-view" className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-h-[62px] flex-none items-center gap-3 px-4 pt-[14px] pb-2 wide:px-6 wide:pt-[18px]">
				<Button asChild variant="icon" size="icon" className="wide:hidden">
					<Link to="/combinations" aria-label="Back" title="Back">
						<ArrowLeft size={18} strokeWidth={1.9} aria-hidden />
					</Link>
				</Button>
				<h2 className="min-w-0 flex-1 break-words font-serif text-[22px] leading-[1.15]">
					{title}
				</h2>
				<Button asChild variant="icon" size="icon">
					<Link
						to={`/build/${combination.id}`}
						aria-label="Change this combination"
						title="Change this combination"
					>
						<Pencil size={18} strokeWidth={1.9} aria-hidden />
					</Link>
				</Button>
				<Button
					variant="icon"
					size="icon"
					aria-label="Delete this combination"
					title="Delete this combination"
					className="text-destructive"
					onClick={onDelete}
				>
					<Trash2 size={18} strokeWidth={1.9} aria-hidden />
				</Button>
			</div>
			<Stage className="mx-3 flex-[0_0_52%] rounded-[24px] wide:-order-1 wide:mx-4 wide:mt-4 wide:flex-[0_0_50%] wide:rounded-[22px]">
				{dress.status === "failed" ? (
					<OutfitFailed onLoadAgain={dress.loadAgain} />
				) : (
					<CombinationFigure
						pieces={combination.pieces.map((p) => ({
							typeId: p.typeId,
							hex: p.colour.hex,
						}))}
						open={combination.open}
						label={title}
					/>
				)}
			</Stage>
			<div className="min-h-0 flex-1 overflow-auto px-4 pb-24 wide:px-6 wide:pb-6">
				{topFirst(combination.pieces).map((p) => (
					<div
						key={p.layer}
						data-slot="piece-line"
						className="flex items-center gap-3 border-border border-b py-[9px] text-[14px] last:border-b-0"
					>
						<span
							className="size-7 flex-none rounded-md border border-border"
							style={{ background: p.colour.hex }}
						/>
						<span>
							{pieceName(p)}
							{LAYER_OF[p.typeId] === "jacket" ? (
								<span className="text-muted-foreground">
									{combination.open ? " · open" : " · closed"}
								</span>
							) : null}
						</span>
						<span className="flex-1" />
						<button
							type="button"
							aria-label={`Copy ${p.colour.hex}`}
							title="Copy"
							className="rounded-full border border-border px-[9px] py-1 font-mono text-xs hover:bg-muted"
							onClick={() =>
								// A failed copy toasts too, and says so.
								navigator.clipboard.writeText(p.colour.hex).then(
									() => toast(`${p.colour.hex} copied`),
									() => toast("Not copied. Try again."),
								)
							}
						>
							{p.colour.hex}
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
