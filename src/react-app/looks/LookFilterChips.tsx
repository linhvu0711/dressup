import { cn } from "cn";
import { Pencil } from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { CHIP, CHIP_DASHED } from "@/components/ui/chip";
import { WEATHER_GROUPS } from "@/dress/modes";
import type { Tag } from "@/tags/tag";
import { filterLabel, type LookFilter } from "./filter";

// The filter chips. One is on at a
// time, so they are radios, not pressed buttons.
export function LookFilterChips({
	filter,
	tags,
	onChange,
	onEditTags,
}: {
	filter: LookFilter;
	tags: Tag[];
	onChange: (filter: LookFilter) => void;
	onEditTags: () => void;
}) {
	const filters: LookFilter[] = [
		"All",
		...WEATHER_GROUPS,
		...tags.map((t) => t.id),
	];
	return (
		<div className="flex flex-none gap-[7px] overflow-x-auto px-4 pt-0.5 pb-3 [scrollbar-width:none] wide:px-6 wide:pb-3.5">
			<ToggleGroup.Root
				type="single"
				aria-label="Filter looks"
				value={filter}
				onValueChange={(value) => {
					// Radix gives "" when the chip that is on is clicked again.
					if (value) onChange(value as LookFilter);
				}}
				className="flex flex-none gap-[7px]"
			>
				{filters.map((f) => (
					<ToggleGroup.Item key={f} value={f} className={CHIP}>
						{filterLabel(f, tags)}
					</ToggleGroup.Item>
				))}
			</ToggleGroup.Root>
			<button
				type="button"
				aria-label="Edit tags"
				title="Edit tags"
				className={cn(CHIP, CHIP_DASHED, "w-8 justify-center px-0")}
				onClick={onEditTags}
			>
				<Pencil size={14} strokeWidth={1.9} aria-hidden />
			</button>
		</div>
	);
}
