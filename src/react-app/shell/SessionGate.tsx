import { Outlet } from "react-router";
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
			<Outlet />
		</AppShell>
	);
}
