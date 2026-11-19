import { useNavigate } from "react-router";
import { useToast } from "@/components/ui/toast";
import { useWallAddress } from "./wall-address";

// A combination the server no longer has: back to the wall, and say so.
export function useLeaveGoneCombination() {
	const navigate = useNavigate();
	const toast = useToast();
	const address = useWallAddress();
	return () => {
		navigate(address.wall, { replace: true });
		toast("This combination is gone");
	};
}
