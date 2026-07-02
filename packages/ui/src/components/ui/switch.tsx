import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "../../lib/utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "ssp-switch peer inline-flex h-5 w-9 shrink-0 items-center border border-transparent px-0.5 shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "ssp-switch-thumb pointer-events-none block size-4 bg-white shadow-sm ring-1 transition-transform"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
