import { useLooks } from "@/looks/api";
import { LookCard } from "@/looks/LookCard";
import { PageHeader } from "../shell/PageHeader";

// The page of docs/prototype/dressup.html:888-893. From 900 px the right part
// is kept for the picked look of #11.
export function LooksPage() {
	const looks = useLooks();
	return (
		<div className="flex min-h-0 flex-1 flex-col wide:grid wide:grid-cols-[minmax(0,1fr)_420px] wide:grid-rows-[minmax(0,1fr)]">
			<div className="flex min-h-0 flex-1 flex-col">
				<PageHeader title="Looks" />
				<div
					data-slot="look-wall"
					className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-3.5 gap-y-5 overflow-auto px-4 pt-[5px] pb-24 wide:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] wide:gap-x-[18px] wide:gap-y-[26px] wide:px-6"
				>
					{looks.data?.map((look) => (
						<LookCard key={look.id} look={look} />
					))}
				</div>
			</div>
			<aside
				data-slot="look-panel"
				aria-label="Picked look"
				className="hidden border-border border-l wide:block"
			/>
		</div>
	);
}
