"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** z-index layer, default 50 */
  z?: number;
}

function Modal({ open, onClose, children, className, z = 50 }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      style={{ zIndex: z }}
      onClick={onClose}
    >
      <div
        className={cn(
          "max-h-[90vh] flex flex-col rounded-xl border bg-background shadow-2xl",
          className ?? "w-[640px]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-3">
      <h2 className="text-base font-semibold">{children}</h2>
      <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ModalBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex-1 overflow-y-auto p-5", className)}>
      {children}
    </div>
  );
}

export { Modal, ModalHeader, ModalBody };
