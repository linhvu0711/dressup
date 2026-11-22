import { ArrowLeft } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { SHEET, SHEET_OVERLAY } from "@/components/ui/sheet";

export const LABEL = "font-medium text-[12.5px] text-muted-foreground";

export const ROW =
	"flex h-11 min-w-0 items-center gap-2 rounded-[12px] border border-input bg-card px-3 text-left text-[14px] outline-none focus-visible:border-ring";

export const INPUT =
	"h-10 min-w-0 rounded-[12px] border border-input bg-card px-3 outline-none focus-visible:border-ring";

export const LIST_ROW =
	"flex h-11 min-w-0 items-center gap-2.5 rounded-[12px] px-2 text-left text-[14px] hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";

// The open focus of a sheet: the phone keeps its keyboard closed until a
// box is tapped; a wide screen focuses `focus`.
export function focusWhenWide(focus: RefObject<HTMLElement | null>) {
	return (e: Event) => {
		e.preventDefault();
		if (window.matchMedia("(min-width: 56.25rem)").matches) {
			focus.current?.focus();
		}
	};
}

// A form in a sheet. A list or a confirm swaps into the same sheet as a
// step: `step` is its title, and Back calls `onBack`.
export function FormSheet({
	title,
	step,
	onBack,
	focus,
	onClose,
	children,
}: {
	title: string;
	step: string | null;
	onBack: () => void;
	focus: RefObject<HTMLElement | null>;
	onClose: () => void;
	children: ReactNode;
}) {
	return (
		<Dialog.Root open onOpenChange={(open) => open || onClose()}>
			<Dialog.Portal>
				<Dialog.Overlay className={SHEET_OVERLAY} />
				<Dialog.Content
					aria-describedby={undefined}
					onOpenAutoFocus={focusWhenWide(focus)}
					className={SHEET}
				>
					{step === null ? (
						<Dialog.Title className="text-[25px] leading-tight">
							{title}
						</Dialog.Title>
					) : (
						<StepTitle title={step} onBack={onBack} />
					)}
					{children}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

export function Field({
	label,
	problem,
	children,
}: {
	label: string;
	problem?: string | null;
	children: ReactNode;
}) {
	return (
		<div data-slot="field" className="flex flex-col gap-1.5">
			<span className={LABEL}>{label}</span>
			{children}
			{problem ? (
				<p role="alert" className="text-[13px] text-destructive">
					{problem}
				</p>
			) : null}
		</div>
	);
}

function StepTitle({ title, onBack }: { title: string; onBack: () => void }) {
	return (
		<div className="flex items-center gap-3">
			<Button
				variant="icon"
				size="icon"
				aria-label="Back"
				title="Back"
				onClick={onBack}
			>
				<ArrowLeft size={18} strokeWidth={1.9} aria-hidden />
			</Button>
			<Dialog.Title className="min-w-0 text-[25px] leading-tight">
				{title}
			</Dialog.Title>
		</div>
	);
}
