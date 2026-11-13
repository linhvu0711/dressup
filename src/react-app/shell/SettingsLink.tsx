import { Settings } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { z } from "zod";

// Router state is whatever history holds, so it is parsed before use.
const settingsState = z.object({ from: z.string().startsWith("/") });

export function pageBeforeSettings(state: unknown): string {
	const parsed = settingsState.safeParse(state);
	if (!parsed.success || parsed.data.from === "/settings") return "/";
	return parsed.data.from;
}

export function SettingsLink({ className }: { className?: string }) {
	const location = useLocation();
	return (
		<NavLink
			to="/settings"
			state={{ from: location.pathname }}
			aria-label="Settings"
			title="Settings"
			className={className}
		>
			<Settings size={18} strokeWidth={1.9} aria-hidden />
		</NavLink>
	);
}
