import React, { type ReactNode } from "react";

export const ASSISTANT_MASCOT_STYLES = [
  "droplet",
  "star",
  "shield",
  "chat",
  "orbit",
] as const;

export type AssistantMascotStyle =
  | "droplet"
  | "star"
  | "shield"
  | "chat"
  | "orbit";
export type AssistantMascotExpression =
  | "calm"
  | "happy"
  | "thinking"
  | "concerned";
/** Supported CSS-pixel dimensions: 24, 32, and 40. */
export type AssistantMascotSize = 24 | 32 | 40;

type AssistantMascotProps = {
  style: AssistantMascotStyle;
  size?: AssistantMascotSize;
  expression?: AssistantMascotExpression;
  className?: string;
};

const eyeY: Record<AssistantMascotExpression, number> = {
  calm: 39,
  happy: 39,
  thinking: 38,
  concerned: 40,
};

function Face({ expression }: { expression: AssistantMascotExpression }) {
  const y = eyeY[expression];

  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.4"
      style={{ color: "var(--primary-foreground)" }}
    >
      {expression === "happy" ? (
        <>
          <path d={`M35 ${y}q2.5-3 5 0`} />
          <path d={`M54 ${y}q2.5-3 5 0`} />
        </>
      ) : (
        <>
          <circle cx="37.5" cy={y} r="1.4" fill="currentColor" stroke="none" />
          <circle cx="56.5" cy={y} r="1.4" fill="currentColor" stroke="none" />
        </>
      )}
      {expression === "thinking" && <path d="m54 34 5-2" />}
      {expression === "concerned" && <path d="m34 33 5 1m17-1 5 1" />}
      <path
        d={
          expression === "happy"
            ? "M40 48q7 8 14 0"
            : expression === "concerned"
              ? "M41 52q6-6 12 0"
              : expression === "thinking"
                ? "M43 49h8"
                : "M42 49q5 3 10 0"
        }
      />
    </g>
  );
}

const silhouettes: Record<AssistantMascotStyle, ReactNode> = {
  droplet: (
    <>
      <path
        d="M48 7C39 20 22 34 22 49a26 26 0 0 0 52 0C74 34 57 20 48 7Z"
        fill="var(--primary)"
      />
      <path
        d="M30 50c0-8 7-16 12-22"
        fill="none"
        opacity=".35"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </>
  ),
  star: (
    <>
      <path
        d="m48 7 11.5 24.5L86 35l-19 18.5L71.5 80 48 67.5 24.5 80 29 53.5 10 35l26.5-3.5L48 7Z"
        fill="var(--primary)"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="m70 19 2 5m-5-2 5-2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </>
  ),
  shield: (
    <>
      <path
        d="M48 8 78 19v22c0 20-12 33-30 43C30 74 18 61 18 41V19L48 8Z"
        fill="var(--primary)"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M27 25 48 17"
        fill="none"
        opacity=".35"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </>
  ),
  chat: (
    <>
      <path
        d="M18 19q0-9 10-9h40q10 0 10 10v29q0 10-10 10H43L26 73l3-14q-11-1-11-11V19Z"
        fill="var(--primary)"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M26 20h10"
        fill="none"
        opacity=".35"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </>
  ),
  orbit: (
    <>
      <circle
        cx="48"
        cy="46"
        r="25"
        fill="var(--primary)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <ellipse
        cx="48"
        cy="46"
        rx="39"
        ry="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        transform="rotate(-25 48 46)"
      />
      <circle cx="14" cy="61" r="4" fill="currentColor" />
      <path
        d="M34 25q8-7 16-6"
        fill="none"
        opacity=".35"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </>
  ),
};

/** Decorative mascot art. Consumers own its surrounding control and accessible name. */
export function AssistantMascot({
  style,
  size = 32,
  expression = "calm",
  className,
}: AssistantMascotProps) {
  // Keep the launcher recognizable if persisted or dynamically supplied values
  // are invalid at runtime, even though the public TypeScript API is narrow.
  const resolvedStyle = ASSISTANT_MASCOT_STYLES.includes(style)
    ? style
    : "chat";
  const resolvedSize = ([24, 32, 40] as const).includes(size) ? size : 32;
  const resolvedExpression = (
    Object.keys(eyeY) as AssistantMascotExpression[]
  ).includes(expression)
    ? expression
    : "calm";

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-mascot-style={resolvedStyle}
      viewBox="0 0 96 96"
      width={resolvedSize}
      height={resolvedSize}
      className={className}
      style={{ color: "var(--foreground)", flex: "none" }}
    >
      {silhouettes[resolvedStyle]}
      <Face expression={resolvedExpression} />
    </svg>
  );
}
