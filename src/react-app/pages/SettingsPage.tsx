import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { MannequinSection } from "@/settings/MannequinSection";
import { authClient } from "../auth-client";
import { meQueryKey, useMe } from "../session";
import { PageHeader } from "../shell/PageHeader";

export function SettingsPage() {
	const me = useMe();
	const queryClient = useQueryClient();
	const navigate = useNavigate();

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
			<PageHeader title="Settings" back />
			<div className="mx-auto flex w-full max-w-[560px] flex-col px-[18px] pt-1.5 pb-11">
				<MannequinSection />
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
			</div>
		</>
	);
}
