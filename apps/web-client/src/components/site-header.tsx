"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useCatalogStore } from "@/store/useCatalogStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Radio } from "lucide-react";

const navItems = [
  { href: "/scenarios", label: "Scenarios" },
  { href: "/simulations", label: "Simulations" },
  { href: "/assessments", label: "Assessments" },
];

export function SiteHeader() {
  useWebSocket();
  const wsConnected = useCatalogStore((s) => s.wsConnected);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-14 items-center px-4">
        {/* Logo */}
        <Link href="/" className="mr-8 flex items-center gap-2.5 group">
          <svg
            className="h-5 w-5 transition-opacity group-hover:opacity-80"
            viewBox="15 15 80 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M75,25 A35,35 0 1,0 75,85" stroke="#e5a820" strokeWidth="6" strokeLinecap="square" />
            <path d="M55,38 Q62,48 55,58 Q48,68 55,78" stroke="#f07030" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="type-subhead">
            Crucible
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative px-3 py-1.5 rounded-md transition-colors",
                  isActive
                    ? "type-nav-active text-foreground bg-secondary"
                    : "type-nav text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Connection status */}
        <div className="flex items-center gap-2 type-timestamp">
          <Radio className={cn(
            "h-3.5 w-3.5 transition-colors",
            wsConnected ? "text-success" : "text-muted-foreground"
          )} />
          <span className={cn(
            "transition-colors",
            wsConnected ? "text-success" : "text-muted-foreground"
          )}>
            {wsConnected ? "CONNECTED" : "OFFLINE"}
          </span>
        </div>
      </div>
    </header>
  );
}
