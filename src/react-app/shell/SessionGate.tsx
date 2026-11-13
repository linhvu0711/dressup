import { Outlet } from "react-router";
import { Toaster } from "@/components/ui/toast";
import { DressStateProvider } from "@/dress/DressState";
import { SignInPage } from "../pages/SignInPage";
import { useMe } from "../session";
import { AppShell } from "./AppShell";
import { UnsavedBar } from "./UnsavedBar";

export function SessionGate() {
	const me = useMe();
	// A failed check shows the sign-in screen too, so the person can try again.
	if (!me.isPending && !me.data) return <SignInPage />;
	const signedIn = !!me.data;
	// The same tree while the session is checked and after, so the shell is
	// not drawn twice; the dress store loads only with a session.
	return (
		<Toaster>
			<DressStateProvider enabled={signedIn}>
				<AppShell notice={signedIn ? <UnsavedBar /> : null}>
					{signedIn ? <Outlet /> : null}
				</AppShell>
			</DressStateProvider>
		</Toaster>
	);
}
