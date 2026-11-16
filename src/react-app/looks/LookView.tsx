import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useDressState } from "@/dress/DressState";
import { Mannequin } from "@/dress/figure/Mannequin";
import { MannequinPlaceholder } from "@/dress/figure/MannequinPlaceholder";
import { GARMENT_NAMES, isJacket } from "@/dress/garments";
import { modeById, outfitOf } from "@/dress/modes";
import { Stage } from "@/dress/Stage";
import { useTags } from "@/tags/api";
import { type Look, lookName } from "./look";

// The open look. Under 900 px
// it is the look's own page, its head row on top with Back; from 900 px it is
// the right part of the Looks page, the head row under the stage.
export function LookView({
	look,
	onDelete,
}: {
	look: Look;
	onDelete: () => void;
}) {
	const dress = useDressState();
	const toast = useToast();
	const navigate = useNavigate();
	const mode = modeById(look.modeId);
	const name = lookName(look);
	// In the tag list's order; a tag deleted on another device is skipped.
	const tags = useTags().data?.filter((t) => look.tags.includes(t.id)) ?? [];
	return (
		<div data-slot="look-view" className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-h-[62px] flex-none items-center gap-3 px-4 pt-[14px] pb-2 wide:px-6 wide:pt-[18px]">
				<Button asChild variant="icon" size="icon" className="wide:hidden">
					<Link to="/looks" aria-label="Back" title="Back">
						<ArrowLeft size={18} strokeWidth={1.9} aria-hidden />
					</Link>
				</Button>
				<h2 className="min-w-0 truncate font-serif text-[28px] leading-[1.1]">
					{name}
				</h2>
				<span className="flex-1" />
				<Button
					variant="icon"
					size="icon"
					aria-label="Edit this look"
					title="Edit this look"
					disabled={dress.status !== "ready"}
					onClick={() => {
						if (dress.status !== "ready") return;
						dress.editLook(look);
						navigate("/");
					}}
				>
					<Pencil size={18} strokeWidth={1.9} aria-hidden />
				</Button>
				<Button
					variant="icon"
					size="icon"
					aria-label="Delete this look"
					title="Delete this look"
					className="text-destructive"
					onClick={onDelete}
				>
					<Trash2 size={18} strokeWidth={1.9} aria-hidden />
				</Button>
			</div>
			<Stage className="mx-3 flex-[0_0_52%] rounded-[24px] wide:-order-1 wide:mx-4 wide:mt-4 wide:flex-[0_0_50%] wide:rounded-[22px]">
				{dress.status === "ready" ? (
					<Mannequin
						layers={outfitOf(mode, look.colours)}
						openJackets={look.open}
						skin={dress.state.mannequin.skin}
						hair={dress.state.mannequin.hair}
						label={name}
					/>
				) : (
					<MannequinPlaceholder />
				)}
			</Stage>
			<div className="min-h-0 flex-1 overflow-auto px-4 pb-24 wide:px-6 wide:pb-6">
				{tags.length ? (
					<div data-slot="look-tags" className="flex flex-wrap gap-[7px] pb-3">
						{tags.map((tag) => (
							<span
								key={tag.id}
								data-slot="look-tag"
								className="rounded-full bg-muted px-[11px] py-[3px] font-medium text-[12px]"
							>
								{tag.name}
							</span>
						))}
					</div>
				) : null}
				{[...mode.garments].reverse().map((garment) => {
					const hex = look.colours[garment];
					if (!hex) return null;
					return (
						<div
							key={garment}
							data-slot="garment-line"
							className="flex items-center gap-3 border-border border-b py-[9px] text-[14px] last:border-b-0"
						>
							<span
								className="size-7 flex-none rounded-md border border-border"
								style={{ background: hex }}
							/>
							<span>
								{GARMENT_NAMES[garment]}
								{isJacket(garment) ? (
									<span className="text-muted-foreground">
										{look.open.includes(garment) ? " · open" : " · closed"}
									</span>
								) : null}
							</span>
							<span className="flex-1" />
							<button
								type="button"
								aria-label={`Copy ${hex}`}
								title="Copy"
								className="rounded-full border border-border px-[9px] py-1 font-mono text-xs hover:bg-muted"
								onClick={() =>
									// A failed copy toasts too, and says so.
									navigator.clipboard.writeText(hex).then(
										() => toast(`${hex} copied`),
										() => toast("Not copied. Try again."),
									)
								}
							>
								{hex}
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}
