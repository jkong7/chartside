"use client";

import { createContext, useContext } from "react";
import type { Edition } from "@/lib/edition";

const EditionContext = createContext<Edition>("core");

export default function EditionProvider({ value, children }: { value: Edition; children: React.ReactNode }) {
  return <EditionContext.Provider value={value}>{children}</EditionContext.Provider>;
}

export const useEdition = () => useContext(EditionContext);
export const useCore = () => useContext(EditionContext) === "core";
