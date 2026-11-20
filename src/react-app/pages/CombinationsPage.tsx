import { cn } from "cn";
import { Plus } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useCloset } from "@/closet/api";
import { useCombinations } from "@/combinations/api";
import { CombinationCard } from "@/combinations/CombinationCard";
import { CombinationFilterSheet } from "@/combinations/CombinationFilterSheet";
import { CombinationsFailed } from "@/combinations/CombinationsFailed";
import { CombinationView } from "@/combinations/CombinationView";
import type { Combination } from "@/combinations/combination";
import { DeleteCombinationDialog } from "@/combinations/DeleteCombinationDialog";
import {
	type CombinationFilter,
	filterChips,
	matchingCombinations,
	NO_FILTER,
	pruneCombinationFilter,
	readCombinationFilter,
	shownText,
	writeCombinationFilter,
} from "@/combinations/filter";
import { pieceKeys } from "@/combinations/marks";
import { useWallAddress, wallAddress } from "@/combinations/wall-address";
import { Button } from "@/components/ui/button";
import { ActiveFilters, FilterButton } from "@/components/ui/filter";
import { Notice } from "@/components/ui/notice";
import { useAddressFilter } from "@/components/ui/use-address-filter";
import { TypeFigure } from "@/dress/figure/TypeFigure";
import { useColours } from "@/labels/api";
import { useMannequin } from "@/mannequin/api";
import { MannequinFailed } from "@/mannequin/MannequinFailed";
import { useTags } from "@/tags/api";
import { PageHeader } from "../shell/PageHeader";
import { Wall } from "../shell/Wall";

const PULSE = "animate-placeholder motion-reduce:animate-none";

// The wall of saved combinations, newest first. The address may name one,
// which opens beside the wall from 900 px and as its own page under it, with
// its card marked. An id the list does not have shows the wall, as a look's
// does.
export function CombinationsPage() {
	const { combinationId } = useParams();
	const combinations = useCombinations();
	const mannequin = useMannequin();
	const tags = useTags();
	const colours = useColours();
	const [params, setParams] = useSearchParams();
	const navigate = useNavigate();
	const address = useWallAddress();
	const cf = useAddressFilter(
		{
			none: NO_FILTER,
			read: readCombinationFilter,
			write: writeCombinationFilter,
			prune: (f) => pruneCombinationFilter(f, tags.data, colours.data),
			chips: (f) =>
				filterChips(f, tags.data, colours.data).map((chip) => ({
					key: chip.key,
					label: chip.label,
					icon: chip.typeId ? <TypeFigure typeId={chip.typeId} /> : undefined,
					without: chip.without,
				})),
		},
		pick,
	);
	const filter = cf.filter;
	// The wall opens the app, and Any never reads the closet, so the closet
	// loads only for Pieces I own.
	const waitsForCloset = filter.own !== "any";
	const closet = useCloset({ enabled: waitsForCloset });
	const owned = closet.data && pieceKeys(closet.data);
	const matching = (f: CombinationFilter) =>
		matchingCombinations(combinations.data, f, owned);
	const matched = matching(filter);
	const visible = matched ?? [];
	const [filtering, setFiltering] = useState(false);
	// An empty wall shows no filter, so it keeps none in its address: the
	// builder carries the address along, and the next save would come back to
	// a wall filtered by something the user cannot see.
	const empty = combinations.data?.length === 0;
	const addressed = params.toString() !== "";
	useEffect(() => {
		if (empty && addressed) setParams("", { replace: true });
	}, [empty, addressed, setParams]);
	// Each pick replaces the address, so Back leaves the page, not one pick. A
	// filter that hides the open combination closes it, as a look's chip does.
	// A pick that waits for the closet makes that check when the closet is in.
	// Only a pick checks: a combination saved from the builder opens even when
	// the filter hides it.
	// The check holds the search it waits for: the address changes a render
	// after the pick, and the old filter must not answer for the new one.
	const [checkFor, setCheckFor] = useState<string | null>(null);
	function pick(
		next: CombinationFilter,
		write: (next: CombinationFilter) => void,
	) {
		const search = writeCombinationFilter(next).toString();
		const nextMatched = matching(next);
		const hidden =
			combinationId !== undefined &&
			nextMatched?.every((c) => c.id !== combinationId) === true;
		setCheckFor(
			combinationId !== undefined && nextMatched === undefined ? search : null,
		);
		if (hidden) navigate(wallAddress(next), { replace: true });
		else write(next);
	}
	const current = params.toString();
	useEffect(() => {
		if (checkFor === null || checkFor !== current || !matched) return;
		setCheckFor(null);
		if (matched.every((c) => c.id !== combinationId))
			navigate(wallAddress(filter), { replace: true });
	}, [checkFor, current, matched, combinationId, filter, navigate]);
	const shown = combinations.data?.find((c) => c.id === combinationId);
	const open = shown !== undefined;
	// The confirm lives here, not in the view: the view goes when the list
	// drops the deleted combination, and the confirm must still say so.
	const [deleting, setDeleting] = useState<Combination | null>(null);
	let wall: ReactNode;
	if (combinations.isPending || (waitsForCloset && closet.isPending)) {
		wall = (
			<Wall>
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
			</Wall>
		);
	} else if (combinations.isError) {
		// Checked before the data: a failed refetch keeps the old list.
		wall = <CombinationsFailed onRetry={() => void combinations.refetch()} />;
	} else if (waitsForCloset && closet.isError && !closet.data) {
		wall = (
			<Notice title="Could not load your closet">
				<Button className="mt-2" onClick={() => void closet.refetch()}>
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
					<Link to={address.builder()}>Build a combination</Link>
				</Button>
			</Notice>
		);
	} else if (mannequin.isError) {
		// After the empty check: with no cards there is no mannequin to fail.
		wall = <MannequinFailed onLoadAgain={() => mannequin.refetch()} />;
	} else if (visible.length === 0) {
		wall = (
			<Notice title="No combinations here">
				<p className="max-w-[30ch] text-muted-foreground">
					No combination matches all of your filters.
				</p>
				<Button className="mt-2" onClick={cf.clear}>
					Clear all
				</Button>
			</Notice>
		);
	} else {
		wall = (
			<Wall slot="combination-wall">
				{visible.map((combination) => (
					<CombinationCard
						key={combination.id}
						combination={combination}
						marked={combination.id === combinationId}
					/>
				))}
			</Wall>
		);
	}
	return (
		<div
			className={cn(
				"flex min-h-0 flex-1 flex-col",
				open &&
					"wide:grid wide:grid-cols-[minmax(0,1fr)_420px] wide:grid-rows-[minmax(0,1fr)]",
			)}
		>
			<div
				className={cn(
					"relative flex min-h-0 flex-1 flex-col",
					open && "hidden wide:flex",
				)}
			>
				<PageHeader
					title="Combinations"
					end={
						<div className="flex items-center gap-3">
							{combinations.data?.length ? (
								<FilterButton
									count={cf.count}
									onClick={() => setFiltering(true)}
								/>
							) : null}
							<Button asChild variant="primary" size="icon">
								<Link
									to={address.builder()}
									aria-label="New combination"
									title="New combination"
								>
									<Plus size={18} strokeWidth={1.9} aria-hidden />
								</Link>
							</Button>
						</div>
					}
				/>
				{combinations.data?.length && matched ? (
					<ActiveFilters
						chips={cf.chips}
						onClearAll={cf.clear}
						shown={shownText(matched.length)}
					/>
				) : null}
				{wall}
			</div>
			{shown ? (
				<aside
					data-slot="combination-panel"
					aria-label="Open combination"
					className="flex min-h-0 flex-1 flex-col wide:border-border wide:border-l"
				>
					<CombinationView
						combination={shown}
						onDelete={() => setDeleting(shown)}
					/>
				</aside>
			) : null}
			{filtering ? (
				<CombinationFilterSheet
					filter={filter}
					onChange={cf.set}
					shown={matched ? shownText(matched.length) : "combinations"}
					onClose={() => setFiltering(false)}
				/>
			) : null}
			{deleting ? (
				<DeleteCombinationDialog
					combination={deleting}
					onClose={() => setDeleting(null)}
				/>
			) : null}
		</div>
	);
}
