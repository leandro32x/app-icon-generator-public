"use client";

import * as React from "react";

import { Input } from "./input";
import { cn } from "./utils";

export interface ColorFieldProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
  className?: string;
  /** Compact (h-8) variant for dense lists such as gradient stops. */
  size?: "sm" | "md";
}

/** Colour swatch (native picker) + editable hex text in a single row. */
function ColorField({
  value,
  onChange,
  id,
  placeholder = "#000000",
  className,
  size = "md",
  "aria-label": ariaLabel,
}: ColorFieldProps) {
  // The native picker only understands 6-digit hex.
  const pickerValue = /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : "#000000";

  return (
    <div data-slot="color-field" className={cn("flex items-center gap-2", className)}>
      <label
        className={cn(
          "relative shrink-0 cursor-pointer overflow-hidden rounded-md border border-input shadow-xs",
          "focus-within:ring-ring/50 focus-within:ring-[3px]",
          size === "sm" ? "size-8" : "size-9",
        )}
        style={{ background: value }}
        title={value}
      >
        <input
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel ?? "Pick a color"}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={cn("flex-1 font-mono text-xs uppercase", size === "sm" ? "h-8" : "h-9")}
        aria-label={ariaLabel ? `${ariaLabel} (hex)` : undefined}
      />
    </div>
  );
}

export { ColorField };
