import type { ReactNode } from "react";
import { BottomBar } from "./BottomBar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children?: ReactNode }) {
	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-background">
			<TopBar />
			<main className="relative flex min-h-0 flex-1 flex-col">{children}</main>
			<BottomBar />
		</div>
	);
}
