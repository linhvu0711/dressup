import { cn } from "cn";
import { Scale, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useLooks } from "@/looks/api";
import { COMPARE_MAX, COMPARE_MIN } from "@/looks/compare";
import { DeleteLookDialog } from "@/looks/DeleteLookDialog";
import { LookCard } from "@/looks/LookCard";
import { LookView } from "@/looks/LookView";
import type { Look, LookId } from "@/looks/look";
import { PageHeader } from "../shell/PageHeader";

const WALL =
	"grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-3.5 gap-y-5 overflow-auto px-4 pt-[5px] pb-24 wide:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] wide:gap-x-[18px] wide:gap-y-[26px] wide:px-6";

const NOTE = "font-sans text-[13px] text-muted-foreground";

const PULSE = "animate-placeholder motion-reduce:animate-none";

function Notice({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
			<h2 className="text-[28px]">{title}</h2>
			{children}
		</div>
	);
}

// The page of docs/prototype/dressup.html:888-893. From 900 px the right part
// shows the opened look, or the newest before one opens (:891). With no look to
// open it is left out, so a notice sits in the middle of the screen; it stays
// while the looks load, so a wall with looks does not move when they come.
// Under 900 px an opened look is a page of its own. A look the URL names but
// the list does not have shows the page as /looks does.
export function LooksPage() {
	const { lookId } = useParams();
	const looks = useLooks();
	const navigate = useNavigate();
	const toast = useToast();
	// null is the wall without the pick state; the list keeps the pick order.
	const [pickedIds, setPicked] = useState<LookId[] | null>(null);
	// A look deleted here or on another device leaves the list, and its pick
	// goes with it, so the count and Compare see only looks that still exist.
	const list = looks.data;
	const picked =
		pickedIds && list
			? pickedIds.filter((id) => list.some((l) => l.id === id))
			: pickedIds;
	const canPick = looks.isSuccess && looks.data.length > 0;
	const panel = looks.isPending || canPick;
	function toggle(id: LookId) {
		if (!picked) return;
		if (picked.includes(id)) setPicked(picked.filter((p) => p !== id));
		else if (picked.length >= COMPARE_MAX) toast("Six looks is the limit.");
		else setPicked([...picked, id]);
	}
	// The confirm lives here, not in the look view: the view goes when the
	// list drops the deleted look, and the confirm must still say so.
	const [deleting, setDeleting] = useState<Look | null>(null);
	// The look in the right part: the one the URL names, else the newest.
	const shown = looks.isSuccess
		? (looks.data.find((l) => l.id === lookId) ?? looks.data[0])
		: undefined;
	const open = shown !== undefined && shown.id === lookId;
	let wall: ReactNode;
	if (looks.isPending) {
		// docs/prototype/dressup.html:863
		wall = (
			<div className={WALL}>
				{Array.from({ length: 6 }, (_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: the cards are all alike and never move.
						key={i}
						data-slot="look-skeleton"
						className="flex flex-col gap-[7px]"
					>
						<span
							className={`block aspect-[2/3] w-full rounded-[14px] bg-[#D3CFC9] ${PULSE}`}
						/>
						<span
							className={`block h-3.5 w-[70%] rounded-[12px] bg-muted ${PULSE}`}
						/>
					</div>
				))}
			</div>
		);
	} else if (looks.isError) {
		// Checked before the data: a failed refetch keeps the old looks.
		wall = (
			<Notice title="Could not load your looks">
				<Button className="mt-2" onClick={() => looks.refetch()}>
					Retry
				</Button>
			</Notice>
		);
	} else if (looks.data.length === 0) {
		// docs/prototype/dressup.html:864
		wall = (
			<Notice title="No looks yet">
				<p className="max-w-[30ch] text-muted-foreground">
					Dress the mannequin, then tap the bookmark button. Your looks come
					here.
				</p>
				<Button asChild variant="primary" className="mt-2">
					<Link to="/">Go to Dress</Link>
				</Button>
			</Notice>
		);
	} else {
		wall = (
			<div data-slot="look-wall" className={WALL}>
				{looks.data.map((look) => (
					<LookCard
						key={look.id}
						look={look}
						picked={look.id === shown?.id}
						pick={
							picked
								? {
										on: picked.includes(look.id),
										toggle: () => toggle(look.id),
									}
								: undefined
						}
					/>
				))}
			</div>
		);
	}
	return (
		<div
			className={cn(
				"flex min-h-0 flex-1 flex-col",
				panel &&
					"wide:grid wide:grid-cols-[minmax(0,1fr)_420px] wide:grid-rows-[minmax(0,1fr)]",
			)}
		>
			<div
				className={cn(
					"relative flex min-h-0 flex-1 flex-col",
					open && "hidden wide:flex",
				)}
			>
				{picked ? (
					<PageHeader
						start={
							<Button
								variant="icon"
								size="icon"
								aria-label="Stop picking"
								title="Stop picking"
								onClick={() => setPicked(null)}
							>
								<X size={18} strokeWidth={1.9} aria-hidden />
							</Button>
						}
						title={`${picked.length} picked`}
						end={<span className={NOTE}>Pick 2 to 6</span>}
					/>
				) : (
					<PageHeader
						title="Looks"
						end={
							canPick ? (
								<Button
									variant="icon"
									size="icon"
									aria-label="Compare"
									title="Compare"
									onClick={() => setPicked([])}
								>
									<Scale size={18} strokeWidth={1.9} aria-hidden />
								</Button>
							) : null
						}
					/>
				)}
				{wall}
				{picked ? (
					// The floating button of docs/prototype/dressup.html:889.
					<Button
						variant="primary"
						size="lg"
						className="-translate-x-1/2 absolute bottom-5 left-1/2 z-[5] shadow-float"
						disabled={picked.length < COMPARE_MIN}
						onClick={() => navigate("/looks/compare", { state: { picked } })}
					>
						<Scale size={18} strokeWidth={1.9} aria-hidden />
						Compare {picked.length}
					</Button>
				) : null}
			</div>
			{panel ? (
				<aside
					data-slot="look-panel"
					aria-label="Picked look"
					className={cn(
						"min-h-0 flex-1 flex-col wide:flex wide:border-border wide:border-l",
						open ? "flex" : "hidden",
					)}
				>
					{shown ? (
						<LookView look={shown} onDelete={() => setDeleting(shown)} />
					) : null}
				</aside>
			) : null}
			{deleting ? (
				<DeleteLookDialog look={deleting} onClose={() => setDeleting(null)} />
			) : null}
		</div>
	);
}
