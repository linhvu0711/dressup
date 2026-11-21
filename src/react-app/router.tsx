import { createBrowserRouter, Navigate } from "react-router";
import { AllowPage } from "./pages/AllowPage";
import { BuildPage } from "./pages/BuildPage";
import { ClosetItemPage } from "./pages/ClosetItemPage";
import { ClosetPage } from "./pages/ClosetPage";
import { CombinationsPage } from "./pages/CombinationsPage";
import { LabelsPage } from "./pages/LabelsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PiecePage } from "./pages/PiecePage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WishlistPage } from "./pages/WishlistPage";
import { SessionGate } from "./shell/SessionGate";

export const router = createBrowserRouter([
	{
		element: <SessionGate />,
		children: [
			{ index: true, element: <Navigate to="/combinations" replace /> },
			{ path: "settings", element: <SettingsPage /> },
			{ path: "combinations", element: <CombinationsPage /> },
			{ path: "combinations/:combinationId", element: <CombinationsPage /> },
			{ path: "build", element: <BuildPage /> },
			{ path: "build/:combinationId", element: <BuildPage /> },
			{ path: "closet", element: <ClosetPage /> },
			{ path: "closet/:itemId", element: <ClosetItemPage /> },
			{ path: "piece/:typeId/:colourId", element: <PiecePage /> },
			{ path: "labels", element: <LabelsPage /> },
			{ path: "wishlist", element: <WishlistPage /> },
			{ path: "*", element: <NotFoundPage /> },
		],
	},
	{ path: "privacy", element: <PrivacyPage /> },
	{ path: "allow", element: <AllowPage /> },
]);
