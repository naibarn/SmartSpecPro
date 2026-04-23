import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ComposerState } from "../composerReducer";

const PLATFORMS: Array<{ value: NonNullable<ComposerState["socialPlatform"]>; label: string }> = [
  { value: "youtube", label: "YouTube" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "upload_post", label: "Upload-Post" },
];

export interface SocialPlatformPickerProps {
  value: ComposerState["socialPlatform"];
  onChange: (value: ComposerState["socialPlatform"]) => void;
  className?: string;
}

export function SocialPlatformPicker({ value, onChange, className }: SocialPlatformPickerProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:flex sm:flex-wrap", className)}>
      {PLATFORMS.map((platform) => (
        <Button
          key={platform.value}
          type="button"
          variant={value === platform.value ? "default" : "outline"}
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => onChange(platform.value)}
        >
          {platform.label}
        </Button>
      ))}
    </div>
  );
}
