import { BookmarkCheck, BookmarkPlus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColourRows, type LiveColour } from "@/dress/ColourRows";
import { useDressState } from "@/dress/DressState";
import { Mannequin } from "@/dress/figure/Mannequin";
import { MannequinPlaceholder } from "@/dress/figure/MannequinPlaceholder";
import { ModePicker, type PickerTab } from "@/dress/ModePicker";
import { modeById, outfitOf } from "@/dress/modes";
import { Stage } from "@/dress/Stage";
import { lookName } from "@/looks/look";
import { SaveLookDialog } from "@/looks/SaveLookDialog";
import { SettingsLink } from "@/shell/SettingsLink";

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
	const dress = useDressState();
	// The pencil on a look opens the colours (docs/prototype/dressup.html:1064).
	const [panel, setPanel] = useState<Panel>(() =>
		dress.status === "ready" && dress.editing ? "colours" : "mode",
	);
	const [pickedTab, setTab] = useState<PickerTab | null>(null);
	// The colour the picker shows before "Add". It stays out of the store,
	// which holds only what the person keeps.
	const [live, setLive] = useState<LiveColour | null>(null);
	const [saving, setSaving] = useState(false);
	// The form saves the outfit behind it, so no load on focus may swap it.
	const showSaveForm = (open: boolean) => {
		setSaving(open);
		if (dress.status === "ready") dress.holdLoads(open);
	};
	const state = dress.status === "ready" ? dress.state : null;
	const editing = dress.status === "ready" ? dress.editing : null;
	const mode = state ? modeById(state.modeId) : null;
	// A stored mode may be in any tab, so until a tab is picked the modes
	// open on the one that holds it.
	const tab = pickedTab ?? mode?.group ?? "Cold";
	const colours =
		state && live
			? { ...state.picked, [live.garment]: live.hex }
			: state?.picked;
	return (
		<div className="flex min-h-0 flex-1 flex-col wide:grid wide:grid-cols-[minmax(300px,372px)_minmax(0,1fr)_minmax(300px,372px)] wide:grid-rows-[minmax(0,1fr)]">
			<h1 className="sr-only">Dress</h1>
			<Stage
				className="flex-[0_0_46%] rounded-b-[24px] wide:col-start-2 wide:row-start-1 wide:my-4 wide:rounded-[26px]"
				corner={
					<>
						<SettingsLink className="wide:hidden border-transparent bg-card shadow-lift" />
						{editing && dress.status === "ready" ? (
							// The edit bar of docs/prototype/dressup.html:81-83, 822.
							<div className="flex h-9 min-w-0 items-center gap-1.5 rounded-full bg-card pr-1 pl-3.5 font-medium text-[12.5px] shadow-lift">
								<span className="truncate">Editing: {lookName(editing)}</span>
								<Button
									variant="icon"
									size="icon-sm"
									aria-label="Stop editing"
									title="Stop editing"
									className="size-[26px] flex-none border-transparent"
									onClick={dress.stopEditing}
								>
									<X size={15} strokeWidth={1.9} aria-hidden />
								</Button>
							</div>
						) : null}
					</>
				}
				action={
					// The prototype's bookmark button, off while the dress loads
					// (docs/prototype/dressup.html:823).
					<Button
						variant="primary"
						size="icon-lg"
						aria-label={editing ? "Save changes" : "Save look"}
						title={editing ? "Save changes" : "Save look"}
						disabled={!state}
						className="shadow-lift"
						onClick={() => showSaveForm(true)}
					>
						{editing ? (
							<BookmarkCheck size={20} strokeWidth={1.9} aria-hidden />
						) : (
							<BookmarkPlus size={20} strokeWidth={1.9} aria-hidden />
						)}
					</Button>
				}
			>
				{state && mode ? (
					<Mannequin
						layers={outfitOf(mode, colours)}
						openJackets={state.open}
						skin={state.mannequin.skin}
						hair={state.mannequin.hair}
						label={`Mannequin in ${mode.name}`}
					/>
				) : (
					<MannequinPlaceholder />
				)}
			</Stage>
			{saving && state ? (
				<SaveLookDialog
					state={state}
					editing={editing}
					onSaved={() => {
						if (dress.status === "ready") dress.endEditing();
					}}
					onClose={() => showSaveForm(false)}
				/>
			) : null}
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
							modeId={state?.modeId ?? null}
							onPick={(id) => {
								if (dress.status === "ready") dress.pickMode(id);
							}}
						/>
					</TabsContent>
					<TabsContent
						forceMount
						value="colours"
						className={`${PANEL} wide:col-start-3`}
					>
						<ColourRows
							live={live}
							onLive={setLive}
							titleClassName={COLUMN_TITLE}
						/>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
