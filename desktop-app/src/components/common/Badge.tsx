import { cn } from "../../utils";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
  className?: string;
}

export function Badge({
  children,
  variant = "default",
  size = "md",
  className,
}: BadgeProps) {
  const variants = {
    default: "bg-gray-700 text-gray-300",
    success: "bg-green-900/50 text-green-400 border border-green-700",
    warning: "bg-yellow-900/50 text-yellow-400 border border-yellow-700",
    danger: "bg-red-900/50 text-red-400 border border-red-700",
    info: "bg-blue-900/50 text-blue-400 border border-blue-700",
  };

  const sizes = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}
