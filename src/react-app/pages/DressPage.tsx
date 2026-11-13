import { useState } from "react";
import { Mannequin } from "@/dress/figure/Mannequin";
import {
	DEFAULT_MODE_ID,
	type ModeId,
	modeById,
	outfitOf,
} from "@/dress/modes";
import { Stage } from "@/dress/Stage";

export function DressPage() {
	const [modeId] = useState<ModeId>(DEFAULT_MODE_ID);
	const mode = modeById(modeId);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<h1 className="sr-only">Dress</h1>
			<Stage className="flex-[0_0_46%] rounded-b-[24px] wide:flex-1 wide:rounded-none">
				<Mannequin
					layers={outfitOf(mode)}
					label={`Mannequin in ${mode.name}`}
				/>
			</Stage>
		</div>
	);
}
