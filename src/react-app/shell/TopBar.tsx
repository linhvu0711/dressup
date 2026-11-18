import { NavLink } from "react-router";
import { MAIN_TABS } from "./main-tabs";
import { SettingsLink } from "./SettingsLink";

const tab =
	"flex items-center gap-[7px] px-0.5 font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:shadow-[inset_0_-1.5px_0_var(--foreground)]";

export function TopBar() {
	return (
		<header className="hidden h-[60px] flex-none items-center gap-7 border-b border-border px-6 wide:flex">
			<span className="font-serif text-[27px] leading-none tracking-[-0.01em]">
				dressup
			</span>
			<nav aria-label="Main" className="flex gap-[22px] self-stretch">
				{MAIN_TABS.map(({ to, label, Icon }) => (
					<NavLink key={to} to={to} className={tab}>
						<Icon size={16} strokeWidth={1.9} aria-hidden />
						{label}
					</NavLink>
				))}
			</nav>
			<span className="flex-1" />
			<SettingsLink />
		</header>
	);
}
