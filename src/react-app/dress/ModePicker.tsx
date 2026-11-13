import { cn } from "cn";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDressState } from "@/dress/DressState";
import { Mannequin } from "@/dress/figure/Mannequin";
import { MODES, type ModeId, outfitOf, type WeatherGroup } from "@/dress/modes";

export type PickerTab = WeatherGroup | "Training";

const TABS: readonly PickerTab[] = ["Hot", "Cool", "Cold", "Training"];

const BOUNDED = "flex min-h-0 flex-1 flex-col gap-2.5 wide:gap-3.5";

// The mode picker of docs/prototype/dressup.html:825-832.
export function ModePicker({
	tab,
	onTab,
	modeId,
	onPick,
}: {
	tab: PickerTab;
	onTab: (tab: PickerTab) => void;
	modeId: ModeId;
	onPick: (id: ModeId) => void;
}) {
	const dress = useDressState();
	if (dress.status !== "ready") return null;
	const { state } = dress;
	const modes =
		tab === "Training"
			? MODES.filter((m) => m.training)
			: MODES.filter((m) => m.group === tab);
	return (
		<Tabs
			value={tab}
			onValueChange={(value) => {
				const next = TABS.find((t) => t === value);
				if (next) onTab(next);
			}}
			className={BOUNDED}
		>
			<TabsList aria-label="Weather">
				{TABS.map((t) => (
					<TabsTrigger key={t} value={t}>
						{t}
					</TabsTrigger>
				))}
			</TabsList>
			<TabsContent value={tab} className={BOUNDED}>
				{/* A new list per tab, so each tab starts at its first card. */}
				<div
					key={tab}
					data-slot="mode-cards"
					className="-mx-1.5 min-h-0 flex-1 overflow-auto px-1.5"
				>
					<div className="grid grid-cols-3 gap-x-2.5 gap-y-3 pt-[5px] pb-[18px] wide:grid-cols-2 wide:gap-x-3.5 wide:gap-y-4">
						{modes.map((mode) => {
							const picked = mode.id === modeId;
							return (
								<button
									key={mode.id}
									type="button"
									aria-pressed={picked}
									onClick={() => onPick(mode.id)}
									className="group flex min-w-0 flex-col gap-1.5 text-left"
								>
									<span
										data-slot="mode-pic"
										className={cn(
											"relative block aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-[#D3CFC9] transition-[filter] duration-200 group-hover:brightness-[1.03] [&>svg]:absolute [&>svg]:inset-0 [&>svg]:size-full",
											picked &&
												"outline-2 outline-foreground outline-offset-[2.5px] outline-solid",
										)}
									>
										<Mannequin
											decorative
											lite
											viewBox="10 14 380 590"
											layers={outfitOf(mode, state.picked)}
											openJackets={state.open}
										/>
										{mode.training && tab !== "Training" ? (
											<span className="absolute bottom-[7px] left-[7px] rounded-full bg-[rgba(26,25,23,.78)] px-2 py-0.5 font-semibold text-[10px] text-white">
												Training
											</span>
										) : null}
									</span>
									<span
										className={cn(
											"font-medium text-muted-foreground text-xs leading-[1.3]",
											picked && "text-foreground",
										)}
									>
										{mode.name}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			</TabsContent>
		</Tabs>
	);
}
