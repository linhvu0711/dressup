import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mannequin } from "@/dress/figure/Mannequin";
import { ModePicker, type PickerTab } from "@/dress/ModePicker";
import {
	DEFAULT_MODE_ID,
	type ModeId,
	modeById,
	outfitOf,
} from "@/dress/modes";
import { Stage } from "@/dress/Stage";

const BOUNDED = "flex min-h-0 flex-1 flex-col gap-2.5 wide:gap-3.5";

// Phone: the stage on top and the picker under a "Mode" tab. Laptop: the
// picker on the left, the stage in the middle, and the right column kept for
// the colours of #7 (docs/prototype/dressup.html:846-851).
export function DressPage() {
	const [modeId, setModeId] = useState<ModeId>(DEFAULT_MODE_ID);
	const [tab, setTab] = useState<PickerTab>("Cold");
	const mode = modeById(modeId);
	return (
		<div className="flex min-h-0 flex-1 flex-col wide:grid wide:grid-cols-[minmax(300px,372px)_minmax(0,1fr)_minmax(300px,372px)] wide:grid-rows-[minmax(0,1fr)]">
			<h1 className="sr-only">Dress</h1>
			<Stage className="flex-[0_0_46%] rounded-b-[24px] wide:col-start-2 wide:row-start-1 wide:my-4 wide:rounded-[26px]">
				<Mannequin
					layers={outfitOf(mode)}
					label={`Mannequin in ${mode.name}`}
				/>
			</Stage>
			<div className="flex min-h-0 flex-1 flex-col gap-2.5 px-4 pt-3 wide:col-start-1 wide:row-start-1 wide:gap-3.5 wide:px-6 wide:pt-5">
				<div className="hidden min-h-[34px] items-center font-serif text-[25px] leading-none tracking-[-.01em] wide:flex">
					Mode
				</div>
				<Tabs value="mode" className={BOUNDED}>
					<TabsList className="wide:hidden">
						<TabsTrigger value="mode">Mode</TabsTrigger>
					</TabsList>
					<TabsContent value="mode" className={BOUNDED}>
						<ModePicker
							tab={tab}
							onTab={setTab}
							modeId={modeId}
							onPick={setModeId}
						/>
					</TabsContent>
				</Tabs>
			</div>
			<div className="hidden wide:col-start-3 wide:row-start-1 wide:block" />
		</div>
	);
}
