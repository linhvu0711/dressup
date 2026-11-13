import { createBrowserRouter } from "react-router";
import { DressPage } from "./pages/DressPage";
import { LooksPage } from "./pages/LooksPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AppShell } from "./shell/AppShell";

export const router = createBrowserRouter([
	{
		element: <AppShell />,
		children: [
			{ index: true, element: <DressPage /> },
			{ path: "looks", element: <LooksPage /> },
			{ path: "settings", element: <SettingsPage /> },
			{ path: "*", element: <NotFoundPage /> },
		],
	},
]);
