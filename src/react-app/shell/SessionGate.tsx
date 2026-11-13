import { Outlet } from "react-router";
import { Toaster } from "@/components/ui/toast";
import { DressStateProvider } from "@/dress/DressState";
import { SignInPage } from "../pages/SignInPage";
import { useMe } from "../session";
import { AppShell } from "./AppShell";

export function SessionGate() {
	const me = useMe();
	if (me.isPending) return <AppShell />;
	// A failed check shows the sign-in screen too, so the person can try again.
	if (!me.data) return <SignInPage />;
	return (
		<AppShell>
			<Toaster>
				<DressStateProvider>
					<Outlet />
				</DressStateProvider>
			</Toaster>
		</AppShell>
	);
}
