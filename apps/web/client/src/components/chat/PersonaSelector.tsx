/**
 * PersonaSelector — Dropdown to select AI persona for a conversation.
 *
 * Lists the user's own + tenant + platform scope personas via
 * the persona.list tRPC query.
 */

import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User } from "lucide-react";

interface PersonaSelectorProps {
  conversationId?: number;
  currentPersonaId?: string | null;
  onSelect?: (personaId: string | null) => void;
}

export function PersonaSelector({
  currentPersonaId,
  onSelect,
}: PersonaSelectorProps) {
  const { data: personas, isLoading } = trpc.persona.list.useQuery(undefined, {
    staleTime: 60_000,
  });

  if (isLoading || !personas || personas.length === 0) {
    return null;
  }

  return (
    <Select
      value={currentPersonaId || "default"}
      onValueChange={(value) => {
        onSelect?.(value === "default" ? null : value);
      }}
    >
      <SelectTrigger className="w-[180px] h-8 text-xs">
        <User className="h-3 w-3 mr-1" />
        <SelectValue placeholder="Select Persona" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">Default</SelectItem>
        {personas.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="flex items-center gap-1">
              {p.name}
              <span className="text-muted-foreground text-[10px]">
                ({p.scope})
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default PersonaSelector;
