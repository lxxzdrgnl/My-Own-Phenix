"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const router = useRouter();

  const handleConfirm = useCallback(() => {
    router.push("/login");
    onClose();
  }, [router, onClose]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>로그인 필요</DialogTitle>
        <DialogDescription>
          로그인이 필요한 서비스입니다.
        </DialogDescription>
        <DialogFooter className="flex gap-2 sm:justify-end">
          <Button variant="outline" onClick={handleCancel}>
            취소
          </Button>
          <Button onClick={handleConfirm}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
