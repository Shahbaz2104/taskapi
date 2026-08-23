"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  length?: number;
  disabled?: boolean;
  /** Receives the joined code after every change. */
  onChange: (value: string) => void;
  /** Fires once each time the code becomes complete. */
  onComplete?: (value: string) => void;
}

/**
 * Paste-split one-time-code field: a full paste distributes across boxes,
 * backspace walks backwards through empties, arrows navigate.
 */
export function OtpInput({
  length = 6,
  disabled,
  onChange,
  onComplete,
}: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const completedRef = useRef(false);

  const commit = (next: string[]) => {
    const joined = next.join("");
    onChange(joined);
    if (joined.length === length && next.every(Boolean)) {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.(joined);
      }
    } else {
      completedRef.current = false;
    }
  };

  const setDigit = (index: number, digit: string) => {
    const next = Array.from({ length }, (_, i) => {
      const input = inputsRef.current[i];
      return input ? input.value : "";
    });
    next[index] = digit;
    commit(next);
  };

  const readAll = () =>
    Array.from({ length }, (_, i) => inputsRef.current[i]?.value ?? "");

  const focusIndex = (i: number) => {
    inputsRef.current[Math.max(0, Math.min(length - 1, i))]?.focus();
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (!digits) return;
    digits.split("").forEach((d, i) => {
      const input = inputsRef.current[i];
      if (input) input.value = d;
    });
    commit(readAll());
    focusIndex(digits.length);
  };

  const handleKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !e.currentTarget.value && i > 0) {
      const prev = inputsRef.current[i - 1];
      if (prev) prev.value = "";
      setDigit(i - 1, "");
      focusIndex(i - 1);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      focusIndex(i - 1);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      focusIndex(i + 1);
      e.preventDefault();
    }
  };

  return (
    <div className="flex gap-2" role="group" aria-label="One-time code">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          className={cn(
            "size-12 rounded-field border border-line bg-base text-center font-mono text-xl text-ink",
            "transition-colors duration-150 ease-out",
            "hover:border-ink-3 focus:border-amber-glow focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
          onChange={(e) => {
            const digit = e.currentTarget.value.replace(/\D/g, "").slice(-1);
            e.currentTarget.value = digit;
            setDigit(i, digit);
            if (digit) focusIndex(i + 1);
          }}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown(i)}
          onFocus={(e) => e.currentTarget.select()}
        />
      ))}
    </div>
  );
}
