import { cn } from "cn";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useLooks } from "@/looks/api";
import { LookCard } from "@/looks/LookCard";
import { PageHeader } from "../shell/PageHeader";

const WALL =
	"grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-3.5 gap-y-5 overflow-auto px-4 pt-[5px] pb-24 wide:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] wide:gap-x-[18px] wide:gap-y-[26px] wide:px-6";

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
// is kept for the picked look of #11. With no look to pick it is left out, so
// a notice sits in the middle of the screen; it stays while the looks load,
// so a wall with looks does not move when they come.
export function LooksPage() {
	const looks = useLooks();
	const panel = looks.isPending || (looks.isSuccess && looks.data.length > 0);
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
					<LookCard key={look.id} look={look} />
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
			<div className="flex min-h-0 flex-1 flex-col">
				<PageHeader title="Looks" />
				{wall}
			</div>
			{panel ? (
				<aside
					data-slot="look-panel"
					aria-label="Picked look"
					className="hidden border-border border-l wide:block"
				/>
			) : null}
		</div>
	);
}
