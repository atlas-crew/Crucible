"use client";

import { useEffect } from "react";
import { useCatalogStore } from "@/store/useCatalogStore";
import { CommandPalette } from "@/components/command-palette";

export function AppInitializer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Rehydrate persisted state after mount to avoid SSR/client mismatch.
    void useCatalogStore.persist.rehydrate();

    // Read actions via getState so this effect never re-subscribes.
    const { sanitizeTransientState, fetchHealth } = useCatalogStore.getState();
    sanitizeTransientState();
    fetchHealth();

    return () => {
      useCatalogStore.getState().destroy();
    };
  }, []);

  return (
    <>
      <CommandPalette />
      {children}
    </>
  );
}
