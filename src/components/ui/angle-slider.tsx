"use client";

import * as React from "react";
import { AngleSlider } from "@ark-ui/react/angle-slider";

import { cn } from "./utils";

export interface AngleDialProps {
  /** Angle in degrees, 0–360 (0 = 12 o'clock, clockwise — same as CSS gradients / rotate). */
  value: number;
  onValueChange: (value: number) => void;
  onValueChangeEnd?: (value: number) => void;
  /** Outer diameter in px. */
  size?: number;
  /** Ring thickness in px. */
  thickness?: number;
  step?: number;
  /** Tick marks (degrees) drawn on the ring. */
  markers?: number[];
  /**
   * How the filled arc is drawn: from 0° clockwise to the value (gradients),
   * the shortest way from 0° so values past 180° read as negative (rotation),
   * or not at all.
   */
  arc?: "from-zero" | "signed" | "none";
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
  /** Replaces the default "123°" read-out in the centre. */
  children?: React.ReactNode;
}

/**
 * Compact rotary angle control built on Ark UI's AngleSlider.
 *
 * Drag anywhere on the ring (or the knob), nudge with arrow keys
 * (Shift = ×10), Home/End jump to 0°/360°. The centre shows the value.
 */
function AngleDial({
  value,
  onValueChange,
  onValueChangeEnd,
  size = 64,
  thickness = 8,
  step = 1,
  markers = [0, 90, 180, 270],
  arc = "from-zero",
  disabled,
  id,
  className,
  children,
  "aria-label": ariaLabel,
}: AngleDialProps) {
  const half = size / 2;
  const radius = half - thickness / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = ((value % 360) + 360) % 360;
  const knob = Math.max(thickness + 6, 14);
  // Filled arc as [start, span] in degrees, clockwise from 12 o'clock.
  const [arcStart, arcSpan] =
    arc === "none"
      ? [0, 0]
      : arc === "signed" && clamped > 180
        ? [clamped, 360 - clamped]
        : [0, clamped];
  const arcLength = (arcSpan / 360) * circumference;

  return (
    <AngleSlider.Root
      id={id}
      value={clamped}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      onValueChange={(d) => onValueChange(d.value)}
      onValueChangeEnd={onValueChangeEnd ? (d) => onValueChangeEnd(d.value) : undefined}
      data-slot="angle-dial"
      className={cn(
        "relative shrink-0 select-none touch-none data-[disabled]:opacity-50",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <AngleSlider.Control className="absolute inset-0 cursor-pointer">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            className="stroke-muted"
            cx={half}
            cy={half}
            r={radius}
            fill="none"
            strokeWidth={thickness}
          />
          {arcSpan > 0 && (
            <circle
              className="stroke-primary/70"
              cx={half}
              cy={half}
              r={radius}
              fill="none"
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${arcLength} ${circumference}`}
              transform={`rotate(${arcStart - 90} ${half} ${half})`}
            />
          )}
        </svg>

        {markers.length > 0 && (
          <AngleSlider.MarkerGroup className="pointer-events-none absolute inset-0">
            {markers.map((m) => (
              <AngleSlider.Marker
                key={m}
                value={m}
                className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
              >
                <span className="block w-px bg-background/70" style={{ height: thickness }} />
              </AngleSlider.Marker>
            ))}
          </AngleSlider.MarkerGroup>
        )}

        <AngleSlider.Thumb
          className={cn(
            "absolute inset-y-0 left-1/2 flex w-[3px] -translate-x-1/2 items-start justify-center outline-none",
            "[&:focus-visible>span]:ring-2 [&:focus-visible>span]:ring-ring/60",
          )}
        >
          <span
            className="block shrink-0 rounded-full border-2 border-background bg-primary shadow-sm"
            style={{ width: knob, height: knob, marginTop: thickness / 2 - knob / 2 }}
          />
        </AngleSlider.Thumb>
      </AngleSlider.Control>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {children ?? (
          <AngleSlider.ValueText className="text-[11px] font-semibold tabular-nums text-foreground">
            <AngleSlider.Context>{(ctx) => <>{Math.round(ctx.value)}°</>}</AngleSlider.Context>
          </AngleSlider.ValueText>
        )}
      </div>
      <AngleSlider.HiddenInput />
    </AngleSlider.Root>
  );
}

export { AngleDial };
