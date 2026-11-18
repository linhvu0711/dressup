import { createBrowserRouter } from "react-router";
import { AllowPage } from "./pages/AllowPage";
import { BuildPage } from "./pages/BuildPage";
import { ClosetPage } from "./pages/ClosetPage";
import { CombinationsPage } from "./pages/CombinationsPage";
import { ComparePage } from "./pages/ComparePage";
import { DressPage } from "./pages/DressPage";
import { LabelsPage } from "./pages/LabelsPage";
import { LooksPage } from "./pages/LooksPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PiecePage } from "./pages/PiecePage";
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
			{ path: "build", element: <BuildPage /> },
			{ path: "build/:combinationId", element: <BuildPage /> },
			{ path: "closet", element: <ClosetPage /> },
			{ path: "piece/:typeId/:colourId", element: <PiecePage /> },
			{ path: "labels", element: <LabelsPage /> },
			{ path: "*", element: <NotFoundPage /> },
		],
	},
	{ path: "privacy", element: <PrivacyPage /> },
	{ path: "allow", element: <AllowPage /> },
]);
