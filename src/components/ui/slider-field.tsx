"use client";

import * as React from "react";

import { Slider } from "./slider";
import { cn } from "./utils";

export interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Suffix shown after the number, e.g. "%" or "°". */
  unit?: string;
  /** Formats the number for the read-out (defaults to the raw value). */
  format?: (value: number) => string;
  /** When set, the read-out is an editable number input (default). */
  editable?: boolean;
  /** Double-clicking the label restores this value. */
  resetTo?: number;
  disabled?: boolean;
  className?: string;
  /** Width class for the label column (defaults to `w-20`). */
  labelClassName?: string;
  id?: string;
}

/**
 * One-line slider: label · track · numeric read-out. Roughly half the height
 * of a stacked label + slider, so several can sit together without the
 * panel feeling crowded.
 */
function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  format,
  editable = true,
  resetTo,
  disabled,
  className,
  labelClassName,
  id,
}: SliderFieldProps) {
  const autoId = React.useId();
  const inputId = id ?? `slider-field-${autoId}`;
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = format ? format(value) : String(value);
  const canReset = resetTo !== undefined && resetTo !== value;

  const commitDraft = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    setDraft(null);
  };

  return (
    <div
      data-slot="slider-field"
      className={cn("grid grid-cols-[auto_1fr_auto] items-center gap-x-3", className)}
    >
      <label
        htmlFor={inputId}
        className={cn(
          "truncate text-xs font-medium leading-4 text-foreground/80",
          canReset && "cursor-pointer",
          labelClassName ?? "w-20",
        )}
        title={canReset ? `${label} — double-click to reset` : label}
        onDoubleClick={canReset ? () => onChange(resetTo as number) : undefined}
      >
        {label}
      </label>
      <Slider
        value={[value]}
        onValueChange={([v]: number[]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        className="[&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-thumb]]:size-3.5"
      />
      <div className="flex items-center gap-1">
        {editable ? (
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            value={draft ?? shown}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setDraft(null);
            }}
            className={cn(
              "h-7 w-12 rounded-md border border-input bg-input-background px-1.5 text-right text-xs tabular-nums outline-none",
              "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              "disabled:opacity-50",
            )}
          />
        ) : (
          <span id={inputId} className="w-12 text-right text-xs tabular-nums text-muted-foreground">
            {shown}
          </span>
        )}
        <span className="w-3 text-xs text-muted-foreground">{unit ?? ""}</span>
      </div>
    </div>
  );
}

export { SliderField };
