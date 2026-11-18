import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PLACEHOLDER } from "@/components/ui/placeholder";
import { BrandSheet } from "./BrandSheet";
import type { Brand } from "./brand";
import { LIST } from "./list";

function BrandRow({ brand, onOpen }: { brand: Brand; onOpen: () => void }) {
	return (
		<li className="flex min-h-[58px] min-w-0 items-center border-b border-border py-[11px]">
			<button
				type="button"
				aria-label={brand.name}
				onClick={onOpen}
				className="flex w-full min-w-0 items-center gap-3 text-left"
			>
				<span className="truncate text-[14px]">{brand.name}</span>
				<span className="flex-1" />
				<ChevronRight
					size={18}
					className="flex-none text-muted-foreground"
					aria-hidden
				/>
			</button>
		</li>
	);
}

// The account's brands, A to Z, and the form to add or rename one.
export function BrandsPart({
	brands,
	adding,
	onAddClose,
}: {
	brands: UseQueryResult<Brand[]>;
	adding: boolean;
	onAddClose: () => void;
}) {
	const [editing, setEditing] = useState<Brand | null>(null);
	return (
		<>
			{brands.isPending ? (
				<ul data-slot="brand-list-loading" className={LIST}>
					{Array.from({ length: 6 }, (_, i) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: the rows are all alike and never move.
							key={i}
							className="flex min-h-[58px] items-center border-b border-border py-[11px]"
						>
							<span
								className={cn("h-3.5 w-[40%] rounded-[6px]", PLACEHOLDER)}
							/>
						</li>
					))}
				</ul>
			) : brands.isError ? (
				// Checked before the data: a failed refetch keeps the old brands.
				<Notice title="Could not load your brands">
					<Button className="mt-2" onClick={() => void brands.refetch()}>
						Retry
					</Button>
				</Notice>
			) : brands.data.length === 0 ? (
				<Notice title="No brands yet">
					<p className="max-w-[30ch] text-muted-foreground">
						Tap + to add your first brand.
					</p>
				</Notice>
			) : (
				<ul data-slot="brand-list" className={LIST}>
					{brands.data.map((brand) => (
						<BrandRow
							key={brand.id}
							brand={brand}
							onOpen={() => setEditing(brand)}
						/>
					))}
				</ul>
			)}
			{(adding || editing) && brands.data ? (
				<BrandSheet
					brands={brands.data}
					editing={editing}
					onClose={() => {
						setEditing(null);
						onAddClose();
					}}
				/>
			) : null}
		</>
	);
}
