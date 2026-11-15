import { AppLogo } from "@/ai-apps/AppLogo";
import type { AiApp } from "@/ai-apps/ai-app";
import { useAiApps } from "@/ai-apps/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

// The page and /api/mcp come from the same Worker, so the page's origin is
// the address an AI app connects to.
const address = () => `${window.location.origin}/api/mcp`;

// The "Connected AI apps" part of the Settings page. The prototype has no
// such part, so it copies the Account rows of SettingsPage.tsx.
export function AiAppsSection() {
	const apps = useAiApps();
	const toast = useToast();
	const mcp = address();

	const copy = () =>
		navigator.clipboard.writeText(mcp).then(
			() => toast("Copied"),
			() => toast("Not copied. Try again."),
		);

	return (
		<>
			<h2 className="mt-[26px] mb-1.5 font-sans text-[12.5px] font-medium text-muted-foreground">
				Connected AI apps
			</h2>
			{apps.data?.length === 0 ? (
				<p className="py-[11px] text-muted-foreground">
					No AI apps connected yet.
				</p>
			) : null}
			<div className="flex min-h-[58px] min-w-0 items-center gap-2.5 border-b border-border py-[11px]">
				<div className="min-w-0">
					<div
						data-slot="ai-app-address"
						className="min-w-0 truncate font-mono text-[12.5px]"
					>
						{mcp}
					</div>
					<small className="block text-xs text-muted-foreground">
						Paste this address into an AI app
					</small>
				</div>
				<span className="flex-1" />
				<Button onClick={copy}>Copy</Button>
			</div>
			<ol
				data-slot="ai-app-steps"
				className="mt-2 flex flex-col gap-1.5 text-[13px] text-muted-foreground"
			>
				<li>
					<b className="font-medium text-foreground">Claude</b>: Customize,
					Connectors, Add, Add custom connector, then paste the address.
				</li>
				<li>
					<b className="font-medium text-foreground">ChatGPT</b>: Plugins, +,
					Add custom MCP server, then paste the address.
				</li>
				<li>
					<b className="font-medium text-foreground">Claude Code</b>: run{" "}
					<code className="font-mono">
						claude mcp add --transport http dressup {mcp}
					</code>
					, then <code className="font-mono">/mcp</code> to sign in.
				</li>
			</ol>
			{apps.isError ? (
				<>
					<p role="alert" className="mt-3 text-[13px] text-destructive">
						Could not load your AI apps. Try again.
					</p>
					<Button className="mt-2 self-start" onClick={() => apps.refetch()}>
						Try again
					</Button>
				</>
			) : (
				apps.data?.map((app) => <AiAppRow key={app.id} app={app} />)
			)}
		</>
	);
}

// A fixed locale, so the date reads the same on every machine: 14 Nov 2026.
const connectedOn = (iso: string) =>
	new Date(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

function AiAppRow({ app }: { app: AiApp }) {
	return (
		<div data-slot="ai-app">
			<div className="flex min-h-[58px] min-w-0 items-center gap-2.5 border-b border-border py-[11px]">
				<AppLogo name={app.name} logo={app.logo ?? undefined} size={34} />
				<div data-slot="ai-app-name" className="min-w-0 truncate">
					{app.name}
					<small className="block text-xs text-muted-foreground">
						Connected {connectedOn(app.connectedAt)}
					</small>
				</div>
				<span className="flex-1" />
				<Button aria-label={`Disconnect ${app.name}`}>Disconnect</Button>
			</div>
		</div>
	);
}
