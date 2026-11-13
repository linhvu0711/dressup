import { useNavigate } from "react-router";
import { useToast } from "@/components/ui/toast";
import type { LookId } from "./look";

// A look the server no longer has: back to the wall, and say so.
export function useLeaveGoneLook() {
	const navigate = useNavigate();
	const toast = useToast();
	return (_id: LookId) => {
		navigate("/looks", { replace: true });
		toast("This look is gone");
	};
}
