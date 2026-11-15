import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { AiAppsSection } from "@/settings/AiAppsSection";
import { DeleteAccount } from "@/settings/DeleteAccount";
import { MannequinSection } from "@/settings/MannequinSection";
import { authClient } from "../auth-client";
import { meQueryKey, useMe } from "../session";
import { BackLink, PageHeader } from "../shell/PageHeader";
import { pageBeforeSettings } from "../shell/SettingsLink";

export function SettingsPage() {
	const me = useMe();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const location = useLocation();

	async function signOut() {
		await authClient.signOut();
		// A check sent before sign-out still carries the old cookies, and its
		// late 200 would put the person back in the app.
		await queryClient.cancelQueries({ queryKey: meQueryKey });
		queryClient.setQueryData(meQueryKey, null);
		navigate("/", { replace: true });
	}

	return (
		<>
			<PageHeader
				title="Settings"
				start={<BackLink to={pageBeforeSettings(location.state)} />}
			/>
			{/* The page scrolls in its own box: on a phone it is taller than the
			    space between the bars, and would run under the "Not saved" bar. */}
			<div className="min-h-0 flex-1 overflow-auto">
				<div className="mx-auto flex w-full max-w-[560px] flex-col px-[18px] pt-1.5 pb-11">
					<MannequinSection />
					<AiAppsSection />
					<h2 className="mt-[26px] mb-1.5 font-sans text-[12.5px] font-medium text-muted-foreground">
						Account
					</h2>
					<div className="flex min-h-[58px] min-w-0 items-center gap-2.5 border-b border-border py-[11px]">
						<div className="min-w-0 truncate">
							{me.data?.email}
							<small className="block text-xs text-muted-foreground">
								Signed in with Google
							</small>
						</div>
						<span className="flex-1" />
						<Button onClick={signOut}>Sign out</Button>
					</div>
					<DeleteAccount />
				</div>
			</div>
		</>
	);
}
