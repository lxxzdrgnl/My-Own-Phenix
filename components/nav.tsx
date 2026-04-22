"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  FlaskConical,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Bot,
  SlidersHorizontal,
  Database,
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { AuthModal } from "@/components/auth-modal";
import { AgentTemplatesModal } from "@/components/agent-templates-modal";

const links = [
  { href: "/", label: "Chat", icon: MessageSquare, public: true },
  { href: "/playground", label: "Playground", icon: FlaskConical, public: false },
  { href: "/projects", label: "Projects", icon: FolderOpen, public: false },
  { href: "/evaluations", label: "Evaluations", icon: SlidersHorizontal, public: false },
  { href: "/datasets", label: "Datasets", icon: Database, public: false },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, public: false },
];

export function Nav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const dismissedRef = useRef(false);

  const handleModalClose = useCallback(() => {
    setShowAuthModal(false);
    dismissedRef.current = true;
  }, []);

  const handleProtectedClick = useCallback(
    (e: React.MouseEvent) => {
      if (!user && !dismissedRef.current) {
        e.preventDefault();
        setShowAuthModal(true);
      }
    },
    [user],
  );

  return (
    <>
      <AuthModal open={showAuthModal} onClose={handleModalClose} />
      <AgentTemplatesModal open={showTemplates} onClose={() => setShowTemplates(false)} />
      <nav className="flex items-center gap-1 border-b px-3 py-2">
        <Link href="/" className="mr-3 text-lg font-bold tracking-tight hover:opacity-80 transition-opacity">
          My Own Phenix
        </Link>
        {links.map(({ href, label, icon: Icon, public: isPublic }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={!isPublic ? handleProtectedClick : undefined}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-base font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          {user ? (
            <>
              <button
                onClick={() => setShowTemplates(true)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Bot className="h-4 w-4" />
                Agents
              </button>
              <button
                onClick={() => signOut(auth)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-base font-medium text-background transition-colors hover:bg-foreground/90"
            >
              Sign in
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
