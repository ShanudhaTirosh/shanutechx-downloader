import type { ReactNode } from "react";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen w-screen flex flex-col bg-surface-base overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto relative">
          <div className="absolute inset-0 bg-brand-glow pointer-events-none" />
          <div className="relative p-6">{children}</div>
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
