/**
 * PersonaSettings — Redirect shim.
 * Personas management has moved to the main Settings page (Personas tab).
 */

import { useEffect } from "react";
import { useLocation } from "wouter";

export default function PersonaSettings() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/settings?tab=personas");
  }, [setLocation]);

  return null;
}
