import type { ReactNode } from "react";
import { BottomBar } from "./BottomBar";
import { TopBar } from "./TopBar";

// `notice` sits under the page and above the bottom bar, where the
// prototype puts its "Not saved" bar (docs/prototype/dressup.html:971).
export function AppShell({
	children,
	notice,
}: {
	children?: ReactNode;
	notice?: ReactNode;
}) {
	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-background">
			<TopBar />
			<main className="relative flex min-h-0 flex-1 flex-col">{children}</main>
			{notice}
			<BottomBar />
		</div>
	);
}
