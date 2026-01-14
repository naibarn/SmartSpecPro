import { Spinner } from "./Spinner";
import { cn } from "../../utils";

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  className?: string;
}

export function LoadingOverlay({
  isLoading,
  message = "Loading...",
  className,
}: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex flex-col items-center justify-center",
        "bg-gray-900/80 backdrop-blur-sm",
        className
      )}
    >
      <Spinner size="lg" />
      {message && <p className="text-gray-400 mt-4">{message}</p>}
    </div>
  );
}
