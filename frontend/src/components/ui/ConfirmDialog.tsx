"use client";

import { useEffect, useRef, useState } from "react";

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

  if (!open) return null;

  function handleConfirm() {
    if (props.kind === "prompt") {
      props.onConfirm(inputValue);
    } else {
      (props as ConfirmProps).onConfirm();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {message && <p className="mt-2 text-sm text-gray-500 whitespace-pre-line">{message}</p>}

        {props.kind === "prompt" && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inputValue.trim()) handleConfirm();
              if (e.key === "Escape") onCancel();
            }}
            placeholder={props.placeholder}
            className="mt-4 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-400 transition"
            autoFocus
          />
        )}

        <div className="mt-5 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={props.kind === "prompt" && !inputValue.trim()}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-brand-600 hover:bg-brand-700 text-white"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
