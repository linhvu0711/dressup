import { Outlet } from "react-router";
import { Toaster } from "@/components/ui/toast";
import { SignInPage } from "../pages/SignInPage";
import { useMe } from "../session";
import { AppShell } from "./AppShell";

export function SessionGate() {
	const me = useMe();
	const userId = me.data?.id ?? null;
	// A failed check shows the sign-in screen too, so the person can try again.
	const signedOut = !me.isPending && !me.data;
	const signedIn = !!me.data;
	// The same tree while the session is checked and after, so the shell is
	// not drawn twice. The page is keyed by account: another account signing
	// in from a second tab gets a page with none of this one's tab or colour
	// preview.
	// One Toaster for both screens, so a toast outlives the switch to the
	// sign-in screen, as "Account deleted" needs.
	return (
		<Toaster>
			{signedOut ? (
				<SignInPage />
			) : (
				<AppShell>{signedIn ? <Outlet key={userId} /> : null}</AppShell>
			)}
		</Toaster>
	);
}
