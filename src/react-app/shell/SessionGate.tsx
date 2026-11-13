import { Outlet } from "react-router";
import { Toaster } from "@/components/ui/toast";
import { DressStateProvider } from "@/dress/DressState";
import { SignInPage } from "../pages/SignInPage";
import { useMe } from "../session";
import { AppShell } from "./AppShell";
import { UnsavedBar } from "./UnsavedBar";

export function SessionGate() {
	const me = useMe();
	const userId = me.data?.id ?? null;
	// A failed check shows the sign-in screen too, so the person can try again.
	const signedOut = !me.isPending && !me.data;
	const signedIn = !!me.data;
	// The same tree while the session is checked and after, so the shell is
	// not drawn twice; the dress store loads only with a session. The page is
	// keyed by account: another account signing in from a second tab gets a
	// page with none of this one's tab, edit mode or colour preview.
	// One Toaster for both screens, so a toast outlives the switch to the
	// sign-in screen, as "Account deleted" needs.
	return (
		<Toaster>
			{signedOut ? (
				<SignInPage />
			) : (
				<DressStateProvider userId={userId}>
					<AppShell notice={signedIn ? <UnsavedBar /> : null}>
						{signedIn ? <Outlet key={userId} /> : null}
					</AppShell>
				</DressStateProvider>
			)}
		</Toaster>
	);
}
