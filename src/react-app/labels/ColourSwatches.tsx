import { cn } from "cn";
import { ToggleGroup } from "radix-ui";
import { PartError } from "@/components/ui/part-error";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { useColours } from "./api";
import type { ColourId } from "./colour";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-y-3";

// One pick for a form, or many for a filter.
type Picks =
	| { value: ColourId | undefined; onChange: (id: ColourId) => void }
	| { values: ColourId[]; onValuesChange: (ids: ColourId[]) => void };

// The account's colours as swatches to pick from, with grey squares while
// they load and a Retry when they could not.
export function ColourSwatches(picks: Picks) {
	const colours = useColours();
	if (colours.isPending)
		return (
			<div className={GRID}>
				{Array.from({ length: 8 }, (_, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: the squares are all alike and never move.
						key={i}
						className={cn("size-[34px] rounded-[10px]", PLACEHOLDER)}
					/>
				))}
			</div>
		);
	if (colours.isError)
		return (
			<PartError onRetry={() => void colours.refetch()}>
				Could not load your colours
			</PartError>
		);
	const picked = (id: ColourId) =>
		"values" in picks ? picks.values.includes(id) : id === picks.value;
	const items = colours.data.map((c) => (
		<ToggleGroup.Item
			key={c.id}
			value={c.id}
			aria-label={c.name}
			title={c.hex}
			className="group flex flex-col items-center gap-1.5"
		>
			<span
				style={{ background: c.hex }}
				className={cn(
					"size-[34px] rounded-[10px] [box-shadow:inset_0_0_0_1px_rgba(110,106,98,.38)] transition-transform duration-150 ease-soft group-hover:scale-[1.07] dark:[box-shadow:inset_0_0_0_1px_rgba(244,241,234,.3)]",
					picked(c.id) &&
						"outline-2 outline-foreground outline-offset-[2.5px] outline-solid",
				)}
			/>
			<span className="max-w-full truncate text-[11.5px] text-muted-foreground">
				{c.name}
			</span>
		</ToggleGroup.Item>
	));
	if ("values" in picks)
		return (
			<ToggleGroup.Root
				type="multiple"
				aria-label="Colour"
				value={picks.values}
				onValueChange={(ids) => picks.onValuesChange(ids as ColourId[])}
				className={GRID}
			>
				{items}
			</ToggleGroup.Root>
		);
	return (
		<ToggleGroup.Root
			type="single"
			aria-label="Colour"
			value={picks.value ?? ""}
			onValueChange={(id) => {
				if (id) picks.onChange(id as ColourId);
			}}
			className={GRID}
		>
			{items}
		</ToggleGroup.Root>
	);
}
