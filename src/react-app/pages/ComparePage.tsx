import { Navigate, useLocation } from "react-router";
import { useLooks } from "@/looks/api";
import { COMPARE_MIN, compareState } from "@/looks/compare";
import { LookFigure } from "@/looks/LookFigure";
import { type Look, lookName } from "@/looks/look";
import { BackLink, PageHeader } from "../shell/PageHeader";

// The compare view of docs/prototype/dressup.html:894-898 and 185-191.
export function ComparePage() {
	const location = useLocation();
	const looks = useLooks();
	const state = compareState.safeParse(location.state);
	// A failed refetch keeps the old looks in data, and opening this page
	// refetches, so a network blip still shows the picks.
	const loaded = looks.data;
	const shown = loaded
		? (state.data?.picked ?? []).flatMap((id) => {
				const look = loaded.find((l) => l.id === id);
				return look ? [look] : [];
			})
		: [];
	// A typed address, a reload after the picks were lost, or a look gone
	// since: the prototype has no compare view without picks.
	if (!state.success || (loaded ? shown.length < COMPARE_MIN : looks.isError))
		return <Navigate to="/looks" replace />;
	return (
		<>
			<PageHeader
				start={<BackLink to="/looks" />}
				title="Compare"
				end={
					loaded ? (
						<span className="font-sans text-[13px] text-muted-foreground">
							{shown.length} looks
							{shown.length > 2 ? (
								<span className="wide:hidden"> · swipe sideways</span>
							) : null}
						</span>
					) : null
				}
			/>
			<div
				data-slot="compare-row"
				className="flex min-h-0 flex-1 snap-x snap-mandatory items-start gap-3 overflow-auto px-4 pt-1 pb-4 wide:justify-center wide:gap-4 wide:px-6 wide:pt-2 wide:pb-6"
			>
				{shown.map((look) => (
					<CompareLook key={look.id} look={look} />
				))}
			</div>
		</>
	);
}

function CompareLook({ look }: { look: Look }) {
	return (
		<div
			data-slot="compare-look"
			className="flex min-w-0 flex-[0_0_42%] snap-start flex-col gap-[7px] wide:max-w-[calc((100dvh-210px)*0.329)] wide:flex-[1_1_0]"
		>
			<span className="relative block aspect-[260/790] w-full flex-none overflow-hidden rounded-[16px] [background:var(--wall)] [&>svg]:absolute [&>svg]:inset-0 [&>svg]:size-full">
				<LookFigure look={look} viewBox="70 14 260 790" />
			</span>
			<span className="mt-0.5 truncate font-medium text-[13.5px]">
				{lookName(look)}
			</span>
		</div>
	);
}
