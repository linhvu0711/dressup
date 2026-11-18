import { cn } from "cn";
import { ToggleGroup } from "radix-ui";
import { Button } from "@/components/ui/button";
import { useColours } from "./api";
import type { ColourId } from "./colour";

const PULSE = "animate-placeholder motion-reduce:animate-none";

// The account's colours as swatches to pick one from, with grey squares while
// they load and a Retry when they could not.
export function ColourSwatches({
	value,
	onChange,
}: {
	value: ColourId | undefined;
	onChange: (id: ColourId) => void;
}) {
	const colours = useColours();
	if (colours.isPending)
		return (
			<div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-y-3">
				{Array.from({ length: 8 }, (_, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: the squares are all alike and never move.
						key={i}
						className={`size-[34px] rounded-[10px] bg-muted ${PULSE}`}
					/>
				))}
			</div>
		);
	if (colours.isError)
		return (
			<div className="flex items-center gap-3">
				<p role="alert" className="text-[13px] text-destructive">
					Could not load your colours
				</p>
				<Button onClick={() => void colours.refetch()}>Retry</Button>
			</div>
		);
	return (
		<ToggleGroup.Root
			type="single"
			aria-label="Colour"
			value={value ?? ""}
			onValueChange={(picked) => {
				if (picked) onChange(picked as ColourId);
			}}
			className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-y-3"
		>
			{colours.data.map((c) => (
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
							c.id === value &&
								"outline-2 outline-foreground outline-offset-[2.5px] outline-solid",
						)}
					/>
					<span className="max-w-full truncate text-[11.5px] text-muted-foreground">
						{c.name}
					</span>
				</ToggleGroup.Item>
			))}
		</ToggleGroup.Root>
	);
}
