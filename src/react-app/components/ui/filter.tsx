import { SlidersHorizontal } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FormSheet } from "@/components/ui/sheet-form";

// The parts of a filter that hold no words of what they filter, so each
// page with a filter draws them alike.

export function FilterButton({
	count,
	onClick,
}: {
	count: number;
	onClick: () => void;
}) {
	return (
		<Button
			variant="icon"
			size="icon"
			aria-label="Filter"
			title="Filter"
			className="relative"
			onClick={onClick}
		>
			<SlidersHorizontal size={18} strokeWidth={1.9} aria-hidden />
			{count > 0 ? (
				<span
					data-slot="filter-count"
					aria-hidden
					className="-top-[7px] -right-[7px] absolute flex size-[18px] items-center justify-center rounded-full bg-foreground font-semibold text-[11px] text-background"
				>
					{count}
				</span>
			) : null}
		</Button>
	);
}

// The Filter sheet. A pick changes the page at once; Show only closes it.
// A list swaps into the same sheet as a step, with Back.
export function FilterSheet({
	step,
	onBack,
	shown,
	onClearAll,
	onClose,
	children,
}: {
	step: string | null;
	onBack: () => void;
	shown: string;
	onClearAll: () => void;
	onClose: () => void;
	children: ReactNode;
}) {
	const showRef = useRef<HTMLButtonElement>(null);
	return (
		<FormSheet
			title="Filter"
			step={step}
			onBack={onBack}
			focus={showRef}
			onClose={onClose}
		>
			{children}
			{step === null ? (
				<div className="flex gap-2.5">
					<Button className="flex-1" onClick={onClearAll}>
						Clear all
					</Button>
					<Button
						ref={showRef}
						variant="primary"
						className="flex-1"
						onClick={onClose}
					>
						Show {shown}
					</Button>
				</div>
			) : null}
		</FormSheet>
	);
}
