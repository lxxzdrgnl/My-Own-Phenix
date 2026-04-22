"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/** Sidebar container — wraps the left panel of any page layout */
export function Sidebar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex w-60 shrink-0 flex-col border-r", className)}>
      {children}
    </div>
  );
}

/** Section header inside a sidebar (e.g. "Projects", "Datasets") */
export function SidebarHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={cn("text-[10px] font-bold uppercase tracking-widest text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/** A clickable item in a sidebar list */
export function SidebarItem({
  active = false,
  className,
  children,
  ...props
}: {
  active?: boolean;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-left transition-colors",
        active ? "bg-accent font-medium" : "hover:bg-accent/50 text-muted-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Link variant of SidebarItem (for URL-based navigation) */
export function SidebarItemLink({
  href,
  active = false,
  className,
  children,
}: {
  href: string;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
        active ? "bg-accent font-medium" : "hover:bg-accent/50 text-muted-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Div variant of SidebarItem (for items that need onClick with div semantics) */
export function SidebarItemDiv({
  active = false,
  className,
  children,
  ...props
}: {
  active?: boolean;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
        active ? "bg-accent font-medium" : "hover:bg-accent/50 text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
