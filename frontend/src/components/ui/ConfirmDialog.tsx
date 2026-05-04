"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

interface BaseProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onCancel: () => void;
}

interface ConfirmProps extends BaseProps {
  kind?: "confirm";
  onConfirm: () => void;
}

interface PromptProps extends BaseProps {
  kind: "prompt";
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
}

type Props = ConfirmProps | PromptProps;

export function ConfirmDialog(props: Props) {
  const {
    open,
    title,
    message,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    variant = "default",
    onCancel,
  } = props;
  const [inputValue, setInputValue] = useState(
    props.kind === "prompt" ? (props.defaultValue ?? "") : ""
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && props.kind === "prompt") {
      setInputValue(props.defaultValue ?? "");
      setTimeout(() => inputRef.current?.select(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleConfirm() {
    if (props.kind === "prompt") props.onConfirm(inputValue);
    else (props as ConfirmProps).onConfirm();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {message && (
            <AlertDialogDescription className="whitespace-pre-line">
              {message}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {props.kind === "prompt" && (
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inputValue.trim()) handleConfirm();
              if (e.key === "Escape") onCancel();
            }}
            placeholder={props.placeholder}
            autoFocus
          />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={props.kind === "prompt" && !inputValue.trim()}
            className={
              variant === "danger"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
