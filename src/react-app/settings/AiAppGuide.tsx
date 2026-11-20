import { cn } from "cn";
import {
	Check,
	ChevronDown,
	Copy,
	type LucideIcon,
	MessageCircle,
	Sparkle,
	Terminal,
} from "lucide-react";
import { Accordion } from "radix-ui";
import { type ReactNode, useEffect, useState } from "react";
import { LABEL } from "@/components/ui/sheet-form";
import { useToast } from "@/components/ui/toast";

// How long the copy icon shows a tick after a copy.
const COPIED_MS = 1500;

// A copy that failed says so in the toast and keeps the copy icon.
export function useCopy() {
	const toast = useToast();
	return (text: string) =>
		navigator.clipboard.writeText(text).then(
			() => {
				toast("Copied");
				return true;
			},
			() => {
				toast("Not copied. Try again.");
				return false;
			},
		);
}

function CodeBox({ text, label }: { text: string; label: string }) {
	const copy = useCopy();
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), COPIED_MS);
		return () => clearTimeout(timer);
	}, [copied]);
	const Icon = copied ? Check : Copy;
	return (
		<div className="mt-2 flex items-center gap-1.5 rounded-[10px] bg-muted py-1.5 pr-1.5 pl-3">
			<code className="min-w-0 flex-1 break-all font-mono text-[12.5px] leading-normal">
				{text}
			</code>
			<button
				type="button"
				aria-label={label}
				title="Copy"
				onClick={() => copy(text).then(setCopied)}
				className="grid size-[30px] flex-none place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
			>
				<Icon size={15} strokeWidth={1.9} aria-hidden />
			</button>
		</div>
	);
}

const Path = ({ to }: { to: string[] }) =>
	to.map((part, i) => (
		<span key={part}>
			{i > 0 ? <span className="text-muted-foreground"> › </span> : null}
			<b className="font-medium">{part}</b>
		</span>
	));

type Step = { text: ReactNode; code?: { text: string; label: string } };

function Steps({ steps }: { steps: Step[] }) {
	return (
		<ol data-slot="ai-app-guide-steps" className="flex flex-col gap-3.5">
			{steps.map((step, i) => (
				// The steps of a card never move, so the index is a stable key.
				// biome-ignore lint/suspicious/noArrayIndexKey: see above
				<li key={i} className="relative grid grid-cols-[22px_1fr] gap-3">
					<span className="relative z-[1] grid size-[22px] place-items-center rounded-full border border-border bg-card font-medium text-[11.5px] text-muted-foreground">
						{i + 1}
					</span>
					{i < steps.length - 1 ? (
						<span
							aria-hidden
							className="absolute top-6 -bottom-3.5 left-[10.5px] w-px bg-border"
						/>
					) : null}
					<div className="min-w-0 pt-px text-[13.5px]">
						<p data-slot="ai-app-guide-step">{step.text}</p>
						{step.code ? <CodeBox {...step.code} /> : null}
					</div>
				</li>
			))}
		</ol>
	);
}

type Guide = {
	name: string;
	where: string;
	Icon: LucideIcon;
	steps: Step[];
};

const guides = (address: string): Guide[] => {
	const paste: Step = {
		text: "Paste this address",
		code: { text: address, label: "Copy address" },
	};
	return [
		{
			name: "Claude",
			where: "Desktop or web",
			Icon: Sparkle,
			steps: [
				{
					text: (
						<>
							Open <Path to={["Customize", "Connectors"]} />
						</>
					),
				},
				{
					text: (
						<>
							Click <Path to={["Add", "Add custom connector"]} />
						</>
					),
				},
				paste,
			],
		},
		{
			name: "ChatGPT",
			where: "Desktop or web",
			Icon: MessageCircle,
			steps: [
				{
					text: (
						<>
							Open <b className="font-medium">Plugins</b> and click{" "}
							<b className="font-medium">+</b>
						</>
					),
				},
				{
					text: (
						<>
							Click <b className="font-medium">Add custom MCP server</b>
						</>
					),
				},
				paste,
			],
		},
		{
			name: "Claude Code",
			where: "Terminal",
			Icon: Terminal,
			steps: [
				{
					text: "Run this in a terminal",
					code: {
						text: `claude mcp add --transport http dressup ${address}`,
						label: "Copy command",
					},
				},
				{
					text: (
						<>
							Type{" "}
							<code className="rounded-md bg-muted px-1.5 py-px font-mono text-[12.5px]">
								/mcp
							</code>{" "}
							and sign in
						</>
					),
				},
			],
		},
	];
};

// The "Set up an AI app" cards: one per app, closed at first, one open at a
// time, so the steps take one line per app until the person picks theirs.
export function AiAppGuide({ address }: { address: string }) {
	return (
		<div data-slot="ai-app-guide" className="mt-[18px] mb-2.5">
			<p className={cn(LABEL, "mb-2")}>Set up an AI app</p>
			<Accordion.Root type="single" collapsible className="flex flex-col gap-2">
				{guides(address).map(({ name, where, Icon, steps }) => (
					<Accordion.Item
						key={name}
						value={name}
						className="rounded-[12px] border border-border bg-card"
					>
						{/* Header is an h3, and index.css gives every h3 the title font. */}
						<Accordion.Header className="font-sans text-[14px] tracking-normal">
							<Accordion.Trigger className="group flex min-h-[50px] w-full items-center gap-[11px] rounded-[12px] px-3 py-[9px] text-left focus-visible:outline-2 focus-visible:outline-ring data-[state=closed]:hover:bg-muted/55">
								<span
									aria-hidden
									className="grid size-7 flex-none place-items-center rounded-lg bg-muted"
								>
									<Icon size={15} strokeWidth={1.9} />
								</span>
								<span className="font-medium">{name}</span>
								<span className="flex-1" />
								<span aria-hidden className="text-muted-foreground text-xs">
									{where}
								</span>
								<ChevronDown
									size={16}
									strokeWidth={1.9}
									aria-hidden
									className="flex-none text-muted-foreground group-data-[state=open]:rotate-180"
								/>
							</Accordion.Trigger>
						</Accordion.Header>
						<Accordion.Content className="px-3.5 pt-1 pb-4">
							<Steps steps={steps} />
						</Accordion.Content>
					</Accordion.Item>
				))}
			</Accordion.Root>
		</div>
	);
}
