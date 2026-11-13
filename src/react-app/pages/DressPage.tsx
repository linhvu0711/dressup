import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColourRows, type LiveColour } from "@/dress/ColourRows";
import { useDressState } from "@/dress/DressState";
import { Mannequin } from "@/dress/figure/Mannequin";
import { ModePicker, type PickerTab } from "@/dress/ModePicker";
import { modeById, outfitOf } from "@/dress/modes";
import { Stage } from "@/dress/Stage";

const BOUNDED = "flex min-h-0 flex-1 flex-col gap-2.5 wide:gap-3.5";

// Both panels stay mounted, so from 900 px each sits in its own column and
// under 900 px the tabs show one (docs/prototype/dressup.html:844-851).
const PANEL = `${BOUNDED} data-[state=inactive]:hidden wide:row-start-1 wide:px-6 wide:pt-5 wide:data-[state=inactive]:flex`;

const COLUMN_TITLE =
	"hidden min-h-[34px] items-center font-serif text-[25px] leading-none tracking-[-.01em] wide:flex";

type Panel = "mode" | "colours";

// Phone: the stage on top and the panels under the "Mode" and "Colours" tabs.
// Laptop: modes on the left, the stage in the middle, colours on the right.
export function DressPage() {
	const { state, pickMode } = useDressState();
	const [panel, setPanel] = useState<Panel>("mode");
	const [tab, setTab] = useState<PickerTab>("Cold");
	// The colour the picker shows before "Add". It stays out of the store,
	// which holds only what the person keeps.
	const [live, setLive] = useState<LiveColour | null>(null);
	const mode = modeById(state.modeId);
	const colours = live
		? { ...state.picked, [live.garment]: live.hex }
		: state.picked;
	return (
		<div className="flex min-h-0 flex-1 flex-col wide:grid wide:grid-cols-[minmax(300px,372px)_minmax(0,1fr)_minmax(300px,372px)] wide:grid-rows-[minmax(0,1fr)]">
			<h1 className="sr-only">Dress</h1>
			<Stage className="flex-[0_0_46%] rounded-b-[24px] wide:col-start-2 wide:row-start-1 wide:my-4 wide:rounded-[26px]">
				<Mannequin
					layers={outfitOf(mode, colours)}
					openJackets={state.open}
					label={`Mannequin in ${mode.name}`}
				/>
			</Stage>
			<div className="flex min-h-0 flex-1 flex-col px-4 pt-3 wide:contents">
				<Tabs
					value={panel}
					onValueChange={(value) => {
						if (value === "mode" || value === "colours") setPanel(value);
					}}
					className={`${BOUNDED} wide:contents`}
				>
					<TabsList className="wide:hidden">
						<TabsTrigger value="mode">Mode</TabsTrigger>
						<TabsTrigger value="colours">Colours</TabsTrigger>
					</TabsList>
					<TabsContent
						forceMount
						value="mode"
						className={`${PANEL} wide:col-start-1`}
					>
						<div className={COLUMN_TITLE}>Mode</div>
						<ModePicker
							tab={tab}
							onTab={setTab}
							modeId={state.modeId}
							onPick={pickMode}
						/>
					</TabsContent>
					<TabsContent
						forceMount
						value="colours"
						className={`${PANEL} wide:col-start-3`}
					>
						<div className="flex min-h-[34px] flex-none items-center text-[13px] wide:hidden">
							<span className="text-muted-foreground">{mode.name}</span>
						</div>
						<div data-slot="colours-title" className={COLUMN_TITLE}>
							Colours
						</div>
						<ColourRows live={live} onLive={setLive} />
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
