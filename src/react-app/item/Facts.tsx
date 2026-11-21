import type { ReactNode } from "react";
import type { Hex } from "@/colour/hex";
import { ColourDot } from "./ItemCard";

// An item's label and value rows.
export function Facts({
	rows,
}: {
	rows: { label: string; value: ReactNode }[];
}) {
	return (
		<dl data-slot="facts" className="flex flex-col">
			{rows.map((row) => (
				<div
					key={row.label}
					className="flex items-center justify-between gap-4 border-border border-b py-3 first:border-t"
				>
					<dt className="text-[13px] text-muted-foreground">{row.label}</dt>
					<dd className="min-w-0 text-right text-[14px]">{row.value}</dd>
				</div>
			))}
		</dl>
	);
}

export function ColourValue({
	colour,
}: {
	colour: { name: string; hex: Hex };
}) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<ColourDot hex={colour.hex} />
			{colour.name}
		</span>
	);
}
