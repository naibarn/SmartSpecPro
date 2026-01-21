/**
 * Toast hook for notifications
 * Uses sonner toast library underneath
 */
import { toast as sonnerToast } from "sonner";

export interface Toast {
  id?: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

export function useToast() {
  const toast = ({ title, description, variant = "default" }: Toast) => {
    if (variant === "destructive") {
      sonnerToast.error(title, {
        description,
      });
    } else {
      sonnerToast(title, {
        description,
      });
    }
  };

  return { toast };
}

export { sonnerToast as toast };
