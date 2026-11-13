import { createBrowserRouter } from "react-router";
import { DressPage } from "./pages/DressPage";
import { LooksPage } from "./pages/LooksPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SessionGate } from "./shell/SessionGate";

export const router = createBrowserRouter([
	{
		element: <SessionGate />,
		children: [
			{ index: true, element: <DressPage /> },
			{ path: "looks", element: <LooksPage /> },
			{ path: "settings", element: <SettingsPage /> },
			{ path: "*", element: <NotFoundPage /> },
		],
	},
	{ path: "privacy", element: <PrivacyPage /> },
]);
