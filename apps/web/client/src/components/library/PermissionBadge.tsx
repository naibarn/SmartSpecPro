import React from "react";
import { Eye, Pencil, Trash2, Crown } from "lucide-react";

const permissionConfig = {
  read: {
    icon: Eye,
    defaultLabel: "Read Only",
    ariaLabel: "Read Only access",
    classes: "bg-blue-100 text-blue-700",
  },
  write: {
    icon: Pencil,
    defaultLabel: "Can Edit",
    ariaLabel: "Can Edit access",
    classes: "bg-green-100 text-green-700",
  },
  delete: {
    icon: Trash2,
    defaultLabel: "Can Delete",
    ariaLabel: "Can Delete access",
    classes: "bg-orange-100 text-orange-700",
  },
  owner: {
    icon: Crown,
    defaultLabel: "Owner",
    ariaLabel: "Owner access",
    classes: "bg-purple-100 text-purple-700",
  },
} as const;

export type PermissionLevel = keyof typeof permissionConfig;

interface PermissionBadgeProps {
  level: PermissionLevel;
  label?: string;
}

export function PermissionBadge({ level, label }: PermissionBadgeProps) {
  const config = permissionConfig[level];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${config.classes}`}
      aria-label={config.ariaLabel}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      <span>{label || config.defaultLabel}</span>
    </span>
  );
}
