import { Toast as ToastPrimitive } from "radix-ui";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useState,
} from "react";

// The toast shows one message for 2.4 s, and a new message replaces the
// old one.
const DURATION_MS = 2400;

const ToastContext = createContext<((message: string) => void) | null>(null);

function Toaster({ children }: { children: ReactNode }) {
	const [shown, setShown] = useState({ message: "", key: 0, open: false });
	const toast = useCallback(
		(message: string) =>
			setShown((s) => ({ message, key: s.key + 1, open: true })),
		[],
	);
	return (
		<ToastContext.Provider value={toast}>
			<ToastPrimitive.Provider duration={DURATION_MS}>
				{children}
				<ToastPrimitive.Root
					key={shown.key}
					data-slot="toast"
					open={shown.open}
					onOpenChange={(open) => setShown((s) => ({ ...s, open }))}
					className="max-w-[calc(100vw-32px)] truncate whitespace-nowrap rounded-full bg-foreground px-4 py-2.5 text-[13.5px] text-background shadow-float data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out data-[state=open]:fade-in data-[state=open]:slide-in-from-bottom-2.5"
				>
					<ToastPrimitive.Description>
						{shown.message}
					</ToastPrimitive.Description>
				</ToastPrimitive.Root>
				{/* Taps go through the toast, so a button under it on a phone still works. */}
				<ToastPrimitive.Viewport className="-translate-x-1/2 pointer-events-none fixed bottom-[82px] left-1/2 z-40 flex outline-none" />
			</ToastPrimitive.Provider>
		</ToastContext.Provider>
	);
}

function useToast() {
	const toast = useContext(ToastContext);
	if (!toast) throw new Error("useToast needs Toaster");
	return toast;
}

export { Toaster, useToast };
