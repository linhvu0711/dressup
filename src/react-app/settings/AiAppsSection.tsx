import { cn } from "cn";
import { AppLogo } from "@/ai-apps/AppLogo";
import type { AiApp } from "@/ai-apps/ai-app";
import { useAiApps, useDisconnectAiApp } from "@/ai-apps/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AiAppGuide, useCopy } from "./AiAppGuide";
import { SETTINGS_HEADING, SETTINGS_ROW } from "./settings-row";

// The page and /api/mcp come from the same Worker, so the page's origin is
// the address an AI app connects to.
const address = () => `${window.location.origin}/api/mcp`;

// The "Connected AI apps" part of the Settings page. It copies the Account
// rows of SettingsPage.tsx.
export function AiAppsSection() {
	const apps = useAiApps();
	const copy = useCopy();
	const mcp = address();

	return (
		<>
			<h2 className={cn(SETTINGS_HEADING, "mt-[26px]")}>Connected AI apps</h2>
			{apps.data?.length === 0 ? (
				<p className="py-[11px] text-muted-foreground">
					No AI apps connected yet.
				</p>
			) : null}
			<div className={SETTINGS_ROW}>
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
				<Button onClick={() => copy(mcp)}>Copy</Button>
			</div>
			<AiAppGuide address={mcp} />
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

// Each row has its own Disconnect, so a failure shows under its own row.
function AiAppRow({ app }: { app: AiApp }) {
	const disconnect = useDisconnectAiApp();
	const toast = useToast();
	return (
		<div data-slot="ai-app">
			<div className={SETTINGS_ROW}>
				<AppLogo name={app.name} logo={app.logo ?? undefined} size={34} />
				<div data-slot="ai-app-name" className="min-w-0 truncate">
					{app.name}
					<small className="block text-xs text-muted-foreground">
						Connected {connectedOn(app.connectedAt)}
					</small>
				</div>
				<span className="flex-1" />
				<Button
					aria-label={`Disconnect ${app.name}`}
					disabled={disconnect.isPending}
					onClick={() =>
						disconnect.mutate(app.id, {
							onSuccess: () => toast("Disconnected"),
						})
					}
				>
					Disconnect
				</Button>
			</div>
			{disconnect.isError ? (
				<p role="alert" className="mt-1.5 text-[13px] text-destructive">
					Not disconnected. Try again.
				</p>
			) : null}
		</div>
	);
}
