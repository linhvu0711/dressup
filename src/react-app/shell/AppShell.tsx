import { Outlet } from "react-router";
import { BottomBar } from "./BottomBar";
import { TopBar } from "./TopBar";

export function AppShell() {
	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-background">
			<TopBar />
			<main className="relative flex min-h-0 flex-1 flex-col">
				<Outlet />
			</main>
			<BottomBar />
		</div>
	);
}
