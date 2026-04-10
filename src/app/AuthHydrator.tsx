"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";

export function AuthHydrator() {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(hydrate, [hydrate]);
  return null;
}
