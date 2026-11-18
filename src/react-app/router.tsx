import { createBrowserRouter } from "react-router";
import { AllowPage } from "./pages/AllowPage";
import { CombinationsPage } from "./pages/CombinationsPage";
import { ComparePage } from "./pages/ComparePage";
import { DressPage } from "./pages/DressPage";
import { LabelsPage } from "./pages/LabelsPage";
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
			{ path: "looks/compare", element: <ComparePage /> },
			{ path: "looks/:lookId", element: <LooksPage /> },
			{ path: "settings", element: <SettingsPage /> },
			{ path: "combinations", element: <CombinationsPage /> },
			{ path: "combinations/:combinationId", element: <CombinationsPage /> },
			{ path: "labels", element: <LabelsPage /> },
			{ path: "*", element: <NotFoundPage /> },
		],
	},
	{ path: "privacy", element: <PrivacyPage /> },
	{ path: "allow", element: <AllowPage /> },
]);
