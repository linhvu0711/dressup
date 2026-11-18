import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useCombinations } from "@/combinations/api";
import { CombinationCard } from "@/combinations/CombinationCard";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useDressState } from "@/dress/DressState";
import { OutfitFailed } from "@/dress/OutfitFailed";
import { PageHeader } from "../shell/PageHeader";

const WALL =
	"grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-3.5 gap-y-5 overflow-auto px-4 pt-[5px] pb-24 wide:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] wide:gap-x-[18px] wide:gap-y-[26px] wide:px-6";

const PULSE = "animate-placeholder motion-reduce:animate-none";

// The wall of saved combinations, newest first. The address may name one,
// as "Open it" does after a refused repeat: that card is marked.
export function CombinationsPage() {
	const { combinationId } = useParams();
	const combinations = useCombinations();
	const dress = useDressState();
	let wall: ReactNode;
	if (combinations.isPending) {
		wall = (
			<div className={WALL}>
				{Array.from({ length: 6 }, (_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: the cards are all alike and never move.
						key={i}
						data-slot="combination-skeleton"
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
	} else if (combinations.isError) {
		// Checked before the data: a failed refetch keeps the old list.
		wall = (
			<Notice title="Could not load your combinations">
				<Button className="mt-2" onClick={() => void combinations.refetch()}>
					Retry
				</Button>
			</Notice>
		);
	} else if (combinations.data.length === 0) {
		wall = (
			<Notice title="No combinations yet">
				<p className="max-w-[30ch] text-muted-foreground">
					Pick 2 to 4 pieces on the mannequin. Your combinations come here.
				</p>
				<Button asChild variant="primary" className="mt-2">
					<Link to="/build">Build a combination</Link>
				</Button>
			</Notice>
		);
	} else if (dress.status === "failed") {
		// After the empty check: with no cards there is no mannequin to fail.
		wall = <OutfitFailed onLoadAgain={dress.loadAgain} />;
	} else {
		wall = (
			<div data-slot="combination-wall" className={WALL}>
				{combinations.data.map((combination) => (
					<CombinationCard
						key={combination.id}
						combination={combination}
						marked={combination.id === combinationId}
					/>
				))}
			</div>
		);
	}
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				title="Combinations"
				end={
					<Button asChild variant="primary" size="icon">
						<Link
							to="/build"
							aria-label="New combination"
							title="New combination"
						>
							<Plus size={18} strokeWidth={1.9} aria-hidden />
						</Link>
					</Button>
				}
			/>
			{wall}
		</div>
	);
}
