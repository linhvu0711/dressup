import { cn } from "cn";
import { Dialog } from "radix-ui";
import { type PointerEvent, useRef, useState } from "react";
import { hexToHsv, hsvToHex, parseHex, readHexInput } from "@/colour/hex";
import { Button } from "@/components/ui/button";
import type { Hex } from "@/dress/garments";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// Calls `onPoint` with the pointer's place in the element, 0 to 1 on each
// axis. Pointer capture keeps a drag going past the element's edge
// (docs/prototype/dressup.html:1001-1011).
function dragHandlers(onPoint: (x: number, y: number) => void) {
	const point = (e: PointerEvent<HTMLDivElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		onPoint(
			clamp01((e.clientX - box.left) / box.width),
			clamp01((e.clientY - box.top) / box.height),
		);
	};
	return {
		onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
			e.currentTarget.setPointerCapture(e.pointerId);
			point(e);
			e.preventDefault();
		},
		onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
			if (e.currentTarget.hasPointerCapture(e.pointerId)) point(e);
		},
	};
}

const KNOB =
	"-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute size-5 rounded-full border-[2.5px] border-white shadow-[0_0_0_1px_rgba(0,0,0,.35),0_2px_6px_rgba(0,0,0,.3)]";

const EDGE = "shadow-[inset_0_0_0_1px_rgba(110,106,98,.35)]";

// The colour picker of docs/prototype/dressup.html:922-928. It knows no
// garment, so skin and hair (#14) can use it too.
export function ColourPicker({
	title,
	start,
	action,
	onLive,
	onDone,
	onCancel,
}: {
	title: string;
	start: Hex;
	action: string;
	onLive: (hex: Hex) => void;
	onDone: (hex: Hex) => void;
	onCancel: () => void;
}) {
	const [[h, s, v], setHsv] = useState(() => hexToHsv(start));
	const [text, setText] = useState<string>(start);
	const [tried, setTried] = useState(false);
	const box = useRef<HTMLInputElement>(null);
	const { hex, bad } = readHexInput(text, tried);

	const fromHsv = (nh: number, ns: number, nv: number) => {
		const next = hsvToHex(nh, ns, nv);
		setHsv([nh, ns, nv]);
		setText(next);
		setTried(false);
		onLive(next);
	};

	const fromText = (value: string) => {
		setText(value);
		setTried(false);
		const next = parseHex(value);
		if (next) {
			setHsv(hexToHsv(next));
			onLive(next);
		}
	};

	const done = () => {
		if (hex) onDone(hex);
		else setTried(true);
	};

	return (
		<Dialog.Root open onOpenChange={(open) => open || onCancel()}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-20" />
				<Dialog.Content
					aria-describedby={undefined}
					onOpenAutoFocus={(e) => {
						// The phone keeps its keyboard closed until the box is tapped
						// (docs/prototype/dressup.html:1012).
						e.preventDefault();
						if (window.matchMedia("(min-width: 56.25rem)").matches) {
							box.current?.focus();
						}
					}}
					className="fixed inset-x-0 bottom-0 z-[21] flex max-h-[88%] flex-col gap-4 overflow-auto rounded-t-[26px] border border-border border-b-0 bg-card p-5 pb-[22px] shadow-float outline-none duration-[260ms] ease-soft data-[state=open]:slide-in-from-bottom-8 data-[state=open]:animate-in wide:inset-x-auto wide:top-[84px] wide:right-6 wide:bottom-auto wide:w-[324px] wide:rounded-[22px] wide:border-b wide:pb-5"
				>
					<Dialog.Title className="text-[22px] leading-tight">
						{title}
					</Dialog.Title>
					<div
						data-slot="colour-area"
						{...dragHandlers((x, y) => fromHsv(h, x, 1 - y))}
						className={cn(
							"relative h-[156px] flex-none cursor-crosshair touch-none rounded-[14px]",
							EDGE,
						)}
						style={{
							background: `linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,hsl(${h} 100% 50%))`,
						}}
					>
						<span
							className={KNOB}
							style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
						/>
					</div>
					<div
						data-slot="hue"
						{...dragHandlers((x) => fromHsv(x * 360, s, v))}
						className={cn(
							"relative h-3.5 flex-none cursor-pointer touch-none rounded-full bg-[linear-gradient(to_right,#f00,#ff0_17%,#0f0_33%,#0ff_50%,#00f_67%,#f0f_83%,#f00)]",
							EDGE,
						)}
					>
						<span
							className={cn(KNOB, "top-1/2")}
							style={{ left: `${(h / 360) * 100}%` }}
						/>
					</div>
					<div>
						<div className="flex items-center gap-2.5">
							<span
								className={cn("size-10 flex-none rounded-xl", EDGE)}
								style={{ background: hex ?? hsvToHex(h, s, v) }}
							/>
							<input
								ref={box}
								value={text}
								onChange={(e) => fromText(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										done();
									}
								}}
								maxLength={9}
								spellCheck={false}
								autoComplete="off"
								aria-label="Colour code"
								aria-invalid={bad}
								className={cn(
									"h-[42px] min-w-0 flex-1 rounded-[10px] border border-input bg-card px-3 font-mono text-[14px] uppercase outline-none focus-visible:border-ring",
									bad && "border-destructive focus-visible:border-destructive",
								)}
							/>
						</div>
						<p
							className={cn(
								"mt-1.5 text-muted-foreground text-xs",
								bad && "text-destructive",
							)}
						>
							{bad
								? "This is not a colour code. Use 6 letters or numbers, like #1F3A5F."
								: "A code like #1F3A5F."}
						</p>
					</div>
					<div className="mt-0.5 flex flex-wrap justify-end gap-2 [&>button]:flex-1 wide:[&>button]:flex-none">
						<Button onClick={onCancel}>Cancel</Button>
						<Button variant="primary" disabled={!hex} onClick={done}>
							{action}
						</Button>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
