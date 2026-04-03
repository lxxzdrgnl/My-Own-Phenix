"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, FlaskConical, FileText, FolderOpen } from "lucide-react";

const links = [
  { href: "/", label: "Chat", icon: MessageSquare },
  { href: "/playground", label: "Playground", icon: FlaskConical },
  { href: "/prompts", label: "Prompts", icon: FileText },
  { href: "/projects", label: "Projects", icon: FolderOpen },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 border-b px-3 py-2">
      <span className="mr-3 text-sm font-bold tracking-tight">
        My Own Phenix
      </span>
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
