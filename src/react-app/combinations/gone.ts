import { useNavigate } from "react-router";
import { useToast } from "@/components/ui/toast";

// A combination the server no longer has: back to the wall, and say so.
export function useLeaveGoneCombination() {
	const navigate = useNavigate();
	const toast = useToast();
	return () => {
		navigate("/combinations", { replace: true });
		toast("This combination is gone");
	};
}
