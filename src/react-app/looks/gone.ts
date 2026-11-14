import { useNavigate } from "react-router";
import { useToast } from "@/components/ui/toast";
import { useDressState } from "@/dress/DressState";
import type { LookId } from "./look";

// A look the server no longer has: back to the wall, and say so.
export function useLeaveGoneLook() {
	const navigate = useNavigate();
	const toast = useToast();
	const dress = useDressState();
	return (id: LookId) => {
		if (dress.status === "ready" && dress.editing?.id === id)
			dress.endEditing();
		navigate("/looks", { replace: true });
		toast("This look is gone");
	};
}
