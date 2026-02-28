import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PresentationElement, PresentationElementPatch } from "@/lib/presentationEditorState";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PropertyPanelProps {
  selectedElement: PresentationElement | null;
  onPatchSelected: (patch: PresentationElementPatch) => void;
}

interface TextPresetDefinition {
  id: string;
  label: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  ariaLabel: string;
  patch: PresentationElementPatch;
}

const TEXT_STYLE_PRESETS: TextPresetDefinition[] = [
  {
    id: "heading",
    label: "Heading",
    fontSize: 28,
    fontWeight: "700",
    fontStyle: "normal",
    ariaLabel: "Apply Heading Text Preset",
    patch: { fontSize: 64, fontWeight: "700", fontStyle: "normal", textDecoration: "none", textAlign: "left", lineHeight: 1.1, letterSpacing: 0, backgroundColor: "transparent" },
  },
  {
    id: "subheading",
    label: "Subheading",
    fontSize: 20,
    fontWeight: "600",
    fontStyle: "normal",
    ariaLabel: "Apply Subheading Text Preset",
    patch: { fontSize: 44, fontWeight: "600", fontStyle: "normal", textDecoration: "none", textAlign: "left", lineHeight: 1.2, letterSpacing: 0, backgroundColor: "transparent" },
  },
  {
    id: "body",
    label: "Body",
    fontSize: 14,
    fontWeight: "400",
    fontStyle: "normal",
    ariaLabel: "Apply Body Text Preset",
    patch: { fontSize: 32, fontWeight: "normal", fontStyle: "normal", textDecoration: "none", textAlign: "left", lineHeight: 1.5, letterSpacing: 0, backgroundColor: "transparent" },
  },
  {
    id: "caption",
    label: "Caption",
    fontSize: 11,
    fontWeight: "400",
    fontStyle: "italic",
    ariaLabel: "Apply Caption Text Preset",
    patch: { fontSize: 22, fontWeight: "normal", fontStyle: "italic", textDecoration: "none", textAlign: "left", lineHeight: 1.4, letterSpacing: 0.05, backgroundColor: "transparent" },
  },
  {
    id: "citation",
    label: "Citation",
    fontSize: 11,
    fontWeight: "500",
    fontStyle: "italic",
    ariaLabel: "Apply Citation Text Preset",
    patch: { fontSize: 26, fontWeight: "500", fontStyle: "italic", textDecoration: "none", textAlign: "right", lineHeight: 1.3, letterSpacing: 0.1, backgroundColor: "transparent" },
  },
  {
    id: "overline",
    label: "OVERLINE",
    fontSize: 9,
    fontWeight: "700",
    fontStyle: "normal",
    ariaLabel: "Apply Overline Text Preset",
    patch: { fontSize: 18, fontWeight: "700", fontStyle: "normal", textDecoration: "none", textAlign: "left", lineHeight: 1.3, letterSpacing: 2, backgroundColor: "transparent" },
  },
];

const FONT_FAMILIES = [
  { label: "Inter", value: "Inter, system-ui, sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Poppins", value: "Poppins, sans-serif" },
  { label: "Montserrat", value: "Montserrat, sans-serif" },
  { label: "Playfair Display", value: "'Playfair Display', Georgia, serif" },
  { label: "Merriweather", value: "Merriweather, Georgia, serif" },
  { label: "Lora", value: "Lora, serif" },
  { label: "Space Grotesk", value: "'Space Grotesk', sans-serif" },
  { label: "DM Sans", value: "'DM Sans', sans-serif" },
  { label: "Nunito", value: "Nunito, sans-serif" },
  { label: "Fira Code", value: "'Fira Code', monospace" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
];

const FONT_WEIGHTS = [
  { label: "Normal", value: "normal" },
  { label: "Medium", value: "500" },
  { label: "SemiBold", value: "600" },
  { label: "Bold", value: "700" },
] as const;

function parseNumberInput(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toColorInputValue(value: string, fallback: string): string {
  const candidate = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(candidate)) return candidate;
  if (/^#[0-9a-fA-F]{3}$/.test(candidate)) {
    return `#${candidate.slice(1).split("").map((c) => `${c}${c}`).join("")}`;
  }
  return fallback;
}

interface ColorFieldProps {
  label: string;
  textAriaLabel: string;
  pickerAriaLabel: string;
  value: string;
  fallback: string;
  onChange: (next: string) => void;
}

function ColorField({ label, textAriaLabel, pickerAriaLabel, value, fallback, onChange }: ColorFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <input
          aria-label={pickerAriaLabel}
          type="color"
          className="h-8 w-8 rounded-md border border-zinc-700 cursor-pointer shrink-0 p-0.5 bg-transparent"
          value={toColorInputValue(value, fallback)}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          aria-label={textAriaLabel}
          className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

function Section({ label, children }: SectionProps) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">{label}</p>
      {children}
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-xs transition-all",
        active
          ? "bg-blue-600 text-white shadow-sm shadow-blue-900"
          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

export function PropertyPanel({ selectedElement, onPatchSelected }: PropertyPanelProps) {
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false);
  const [weightDropdownOpen, setWeightDropdownOpen] = useState(false);

  if (!selectedElement) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2">
        <p className="text-sm text-zinc-500">Select an element to edit</p>
      </div>
    );
  }

  // Text-element specific derived values (safe to compute; guarded by type check below)
  const textEl = selectedElement.type === "text" ? selectedElement : null;
  const currentFont = textEl?.fontFamily ?? "Inter, system-ui, sans-serif";
  const currentWeight = textEl?.fontWeight ?? "600";
  const currentFontLabel = FONT_FAMILIES.find((f) => f.value === currentFont)?.label ?? currentFont.split(",")[0];
  const currentWeightLabel = FONT_WEIGHTS.find((w) => w.value === currentWeight)?.label ?? currentWeight;

  return (
    <div
      className="space-y-5 text-sm"
      data-testid="canvas-property-panel"
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* ── Position & Size ── */}
      <Section label="Transform">
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: "X", field: "x" as const, value: selectedElement.x },
            { label: "Y", field: "y" as const, value: selectedElement.y },
            { label: "W", field: "width" as const, value: selectedElement.width },
            { label: "H", field: "height" as const, value: selectedElement.height },
          ].map(({ label, field, value }) => (
            <label key={field} className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-400">{label}</span>
              <input
                aria-label={`Element ${field}`}
                type="number"
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={value}
                onChange={(e) => onPatchSelected({ [field]: parseNumberInput(e.target.value, value) } as PresentationElementPatch)}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-[10px] text-zinc-400">Rotation (°)</span>
            <input
              aria-label="Element Rotation"
              type="number"
              className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={selectedElement.rotation ?? 0}
              onChange={(e) => onPatchSelected({ rotation: parseNumberInput(e.target.value, selectedElement.rotation ?? 0) })}
            />
          </label>
        </div>
      </Section>

      {/* ── TEXT ELEMENT ── */}
      {selectedElement.type === "text" && (
        <>
          {/* Text Content */}
          <Section label="Content">
            <Textarea
              aria-label="Text Content"
              className="min-h-[72px] resize-none bg-zinc-800 border-zinc-700 text-zinc-100 text-sm focus:ring-blue-500"
              value={selectedElement.text}
              onChange={(e) => onPatchSelected({ text: e.target.value } as PresentationElementPatch)}
            />
          </Section>

          {/* Presets */}
          <Section label="Text Presets">
            <div className="grid grid-cols-3 gap-1.5">
              {TEXT_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-label={preset.ariaLabel}
                  onClick={() => onPatchSelected(preset.patch)}
                  className="flex h-10 items-center justify-center overflow-hidden rounded-md border border-zinc-700 bg-zinc-800 px-2 text-zinc-200 transition-all hover:border-blue-500 hover:bg-zinc-700 hover:text-white"
                  style={{
                    fontSize: Math.min(preset.fontSize, 13),
                    fontWeight: preset.fontWeight,
                    fontStyle: preset.fontStyle,
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Text Effects */}
          <Section label="Text Effects">
            <div className="grid grid-cols-2 gap-2">
              {/* None */}
              <button
                type="button"
                aria-label="Clear text effects"
                onClick={() => onPatchSelected({ textShadow: undefined, textStroke: undefined, color: "#ffffff" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-200 transition-all hover:border-zinc-500 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: "1.7rem", color: "#e5e7eb", fontWeight: 700, lineHeight: 1 }}>Text</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">NONE</span>
              </button>
              {/* Blue — Bangers */}
              <button
                type="button"
                aria-label="Blue outline effect"
                onClick={() => onPatchSelected({ color: "#60a5fa", textStroke: "3px #ffffff", textShadow: "3px 3px 0px #1e3a8a, 0 0 15px #3b82f6", fontWeight: "700", fontFamily: "Bangers, cursive" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-blue-500 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "Bangers, cursive", fontSize: "2rem", letterSpacing: "0.05em", color: "#60a5fa", WebkitTextStroke: "2.5px #ffffff", textShadow: "3px 3px 0 #1e3a8a, 0 0 12px #3b82f6", lineHeight: 1 }}>BLUE</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">OUTLINE</span>
              </button>
              {/* Red — Paytone One */}
              <button
                type="button"
                aria-label="Red bold effect"
                onClick={() => onPatchSelected({ color: "#ef4444", textStroke: "3px #1a0000", textShadow: "4px 4px 0px #7f1d1d, 0 0 15px #ef4444", fontWeight: "700", fontFamily: "'Paytone One', sans-serif" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-red-600 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "'Paytone One', sans-serif", fontSize: "1.9rem", color: "#ef4444", WebkitTextStroke: "2.5px #1a0000", textShadow: "4px 4px 0 #7f1d1d", lineHeight: 1 }}>RED</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">BOLD</span>
              </button>
              {/* Gold — Bebas Neue */}
              <button
                type="button"
                aria-label="Gold effect"
                onClick={() => onPatchSelected({ color: "#fbbf24", textStroke: "3px #92400e", textShadow: "4px 4px 0px #78350f, 0 0 20px #fbbf24, 0 0 40px #f59e0b", fontWeight: "700", fontFamily: "'Bebas Neue', sans-serif" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-yellow-500 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "2.2rem", letterSpacing: "0.05em", color: "#fbbf24", WebkitTextStroke: "2.5px #92400e", textShadow: "3px 3px 0 #78350f, 0 0 16px #fbbf24", lineHeight: 1 }}>GOLD</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">GLOW</span>
              </button>
              {/* Purple — Fredoka One */}
              <button
                type="button"
                aria-label="Purple glow effect"
                onClick={() => onPatchSelected({ color: "#c4b5fd", textStroke: "3px #4c1d95", textShadow: "3px 3px 0px #4c1d95, 0 0 20px #7c3aed, 0 0 40px #7c3aed", fontWeight: "700", fontFamily: "'Fredoka One', cursive" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-purple-500 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "'Fredoka One', cursive", fontSize: "1.9rem", color: "#c4b5fd", WebkitTextStroke: "2.5px #4c1d95", textShadow: "2px 2px 0 #4c1d95, 0 0 15px #7c3aed", lineHeight: 1 }}>Magic</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">PURPLE</span>
              </button>
              {/* Neon — Righteous */}
              <button
                type="button"
                aria-label="Neon green effect"
                onClick={() => onPatchSelected({ color: "#ffffff", textStroke: "2px #22c55e", textShadow: "0 0 10px #22c55e, 0 0 25px #16a34a, 0 0 50px #15803d, 0 0 80px #14532d", fontWeight: "700", fontFamily: "Righteous, cursive" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-green-500 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "Righteous, cursive", fontSize: "1.9rem", color: "#ffffff", WebkitTextStroke: "1.5px #22c55e", textShadow: "0 0 10px #22c55e, 0 0 25px #16a34a, 0 0 40px #15803d", lineHeight: 1 }}>Neon</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">GLOW</span>
              </button>
              {/* 3D — Oswald */}
              <button
                type="button"
                aria-label="3D shadow effect"
                onClick={() => onPatchSelected({ color: "#e2e8f0", textStroke: "2px #475569", textShadow: "1px 1px 0 #cbd5e1, 2px 2px 0 #94a3b8, 3px 3px 0 #64748b, 4px 4px 0 #475569, 5px 5px 8px rgba(0,0,0,0.7)", fontWeight: "700", fontFamily: "Oswald, sans-serif" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-slate-400 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "Oswald, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#e2e8f0", WebkitTextStroke: "1.5px #475569", textShadow: "1px 1px 0 #94a3b8, 3px 3px 0 #475569, 5px 5px 6px rgba(0,0,0,0.6)", lineHeight: 1 }}>3D</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">DEPTH</span>
              </button>
              {/* Hollow — Boogaloo */}
              <button
                type="button"
                aria-label="Hollow outline effect"
                onClick={() => onPatchSelected({ color: "transparent", textStroke: "4px #ffffff", textShadow: "0 0 10px rgba(255,255,255,0.4)", fontWeight: "700", fontFamily: "Boogaloo, cursive" } as PresentationElementPatch)}
                className="flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 transition-all hover:border-zinc-400 hover:bg-zinc-800"
              >
                <span style={{ fontFamily: "Boogaloo, cursive", fontSize: "2rem", color: "transparent", WebkitTextStroke: "2.5px #ffffff", lineHeight: 1 }}>Open</span>
                <span className="text-[10px] text-zinc-500 tracking-wider mt-1">HOLLOW</span>
              </button>
            </div>
          </Section>

          {/* Subtitle Styles */}
          <Section label="Subtitle Styles">
            <div className="grid grid-cols-1 gap-2">
              {/* Classic — white text + semi-transparent dark bg */}
              <button
                type="button"
                aria-label="Classic subtitle style"
                onClick={() => onPatchSelected({
                  color: "#ffffff", backgroundColor: "rgba(0,0,0,0.7)",
                  textStroke: undefined, textShadow: "none",
                  fontSize: 32, fontWeight: "normal", textAlign: "center",
                  fontFamily: "Poppins, sans-serif", lineHeight: 1.5, letterSpacing: 0
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-zinc-500"
              >
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: "0.95rem", color: "#fff", background: "rgba(0,0,0,0.7)", padding: "4px 16px", borderRadius: "4px", fontWeight: 400 }}>
                  Lorem ipsum dolor sit amet
                </span>
              </button>
              {/* Yellow Highlight */}
              <button
                type="button"
                aria-label="Yellow highlight subtitle"
                onClick={() => onPatchSelected({
                  color: "#0a0a0a", backgroundColor: "#facc15",
                  textStroke: undefined, textShadow: "none",
                  fontSize: 30, fontWeight: "700", textAlign: "center",
                  fontFamily: "'Nunito', sans-serif", lineHeight: 1.4, letterSpacing: 0
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-yellow-500"
              >
                <span style={{ fontFamily: "'Nunito', sans-serif", fontSize: "0.9rem", fontWeight: 800, color: "#0a0a0a", background: "#facc15", padding: "4px 12px", borderRadius: "2px" }}>
                  Lorem ipsum dolor sit amet
                </span>
              </button>
              {/* Soft Gradient bar — pink/purple */}
              <button
                type="button"
                aria-label="Gradient bar subtitle"
                onClick={() => onPatchSelected({
                  color: "#ffffff", backgroundColor: "rgba(168,85,247,0.75)",
                  textStroke: undefined, textShadow: "0 2px 8px rgba(0,0,0,0.5)",
                  fontSize: 30, fontWeight: "600", textAlign: "center",
                  fontFamily: "Poppins, sans-serif", lineHeight: 1.4, letterSpacing: 0
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-purple-500"
              >
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: "0.9rem", fontWeight: 600, color: "#fff", background: "linear-gradient(90deg, #ec4899 0%, #a855f7 100%)", padding: "5px 16px", borderRadius: "4px" }}>
                  Please Put Your Title Here
                </span>
              </button>
              {/* Bordered Box */}
              <button
                type="button"
                aria-label="Bordered box subtitle"
                onClick={() => onPatchSelected({
                  color: "#ffffff", backgroundColor: "transparent",
                  textStroke: "2px #ffffff", textShadow: "2px 2px 8px rgba(0,0,0,0.8)",
                  fontSize: 30, fontWeight: "700", textAlign: "center",
                  fontFamily: "Montserrat, sans-serif", lineHeight: 1.4, letterSpacing: 1
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-zinc-400"
              >
                <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: "0.9rem", fontWeight: 700, color: "#fff", WebkitTextStroke: "0.5px #fff", border: "1.5px solid #ffffff", padding: "4px 14px", borderRadius: "4px", letterSpacing: "0.05em" }}>
                  Lorem ipsum dolor sit amet
                </span>
              </button>
              {/* Cinema — thin elegant white */}
              <button
                type="button"
                aria-label="Cinema subtitle style"
                onClick={() => onPatchSelected({
                  color: "#f8f8f8", backgroundColor: "transparent",
                  textStroke: undefined, textShadow: "0 2px 12px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)",
                  fontSize: 28, fontWeight: "normal", textAlign: "center",
                  fontFamily: "Montserrat, sans-serif", lineHeight: 1.5, letterSpacing: 1
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-zinc-400"
              >
                <span style={{ fontFamily: "Montserrat, sans-serif", fontSize: "0.85rem", fontWeight: 300, color: "#f8f8f8", textShadow: "0 1px 8px rgba(0,0,0,1)", letterSpacing: "0.08em" }}>
                  Lorem ipsum dolor sit amet
                </span>
              </button>
              {/* Teal / Neon Pop */}
              <button
                type="button"
                aria-label="Neon teal subtitle"
                onClick={() => onPatchSelected({
                  color: "#ccfbf1", backgroundColor: "rgba(15,118,110,0.8)",
                  textStroke: undefined, textShadow: "0 0 10px #14b8a6",
                  fontSize: 30, fontWeight: "700", textAlign: "center",
                  fontFamily: "Righteous, cursive", lineHeight: 1.4, letterSpacing: 0.5
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-teal-500"
              >
                <span style={{ fontFamily: "Righteous, cursive", fontSize: "0.9rem", fontWeight: 700, color: "#ccfbf1", background: "rgba(15,118,110,0.85)", padding: "4px 14px", borderRadius: "4px", textShadow: "0 0 8px #14b8a6" }}>
                  Please edit your text.
                </span>
              </button>
              {/* Dark Glass / Frosted */}
              <button
                type="button"
                aria-label="Dark glass subtitle"
                onClick={() => onPatchSelected({
                  color: "#e0f2fe", backgroundColor: "rgba(12,43,77,0.85)",
                  textStroke: undefined, textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                  fontSize: 28, fontWeight: "600", textAlign: "left",
                  fontFamily: "Poppins, sans-serif", lineHeight: 1.5, letterSpacing: 0
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-blue-500"
              >
                <span style={{ fontFamily: "Poppins, sans-serif", fontSize: "0.85rem", fontWeight: 600, color: "#e0f2fe", background: "rgba(12,43,77,0.9)", padding: "5px 14px", borderRadius: "6px", border: "1px solid rgba(100,180,255,0.3)" }}>
                  [Lorem ipsum dolor sit amet]
                </span>
              </button>
              {/* Comic / Pop Art */}
              <button
                type="button"
                aria-label="Comic pop art subtitle"
                onClick={() => onPatchSelected({
                  color: "#fef08a", backgroundColor: "transparent",
                  textStroke: "2px #000000", textShadow: "3px 3px 0 #000",
                  fontSize: 36, fontWeight: "700", textAlign: "center",
                  fontFamily: "Bangers, cursive", lineHeight: 1.2, letterSpacing: 2
                } as PresentationElementPatch)}
                className="flex h-14 items-center justify-center overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 transition-all hover:border-yellow-400"
              >
                <span style={{ fontFamily: "Bangers, cursive", fontSize: "1.1rem", color: "#fef08a", WebkitTextStroke: "1.5px #000", textShadow: "2px 2px 0 #000", letterSpacing: "0.08em" }}>
                  YOU DON'T WANT TO BE
                </span>
              </button>
            </div>
          </Section>

          {/* Font Family */}
          <Section label="Font Family">
            <div className="relative">
              <button
                type="button"
                onClick={() => { setFontDropdownOpen(!fontDropdownOpen); setWeightDropdownOpen(false); }}
                className="flex w-full items-center justify-between rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:border-zinc-500 transition-colors"
                style={{ fontFamily: currentFont }}
              >
                <span>{currentFontLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
              </button>
              {fontDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-md border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                  {FONT_FAMILIES.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => { onPatchSelected({ fontFamily: f.value } as PresentationElementPatch); setFontDropdownOpen(false); }}
                      className={cn(
                        "flex w-full items-center px-3 py-2 text-sm hover:bg-zinc-700 transition-colors text-left",
                        currentFont === f.value ? "bg-blue-600/20 text-blue-300" : "text-zinc-200"
                      )}
                      style={{ fontFamily: f.value }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* Font Size + Weight */}
          <Section label="Typography">
            <div className="flex items-center gap-2">
              {/* Font Size */}
              <div className="flex flex-col gap-1 w-20 shrink-0">
                <span className="text-[10px] text-zinc-400">Size</span>
                <input
                  aria-label="Text Font Size"
                  type="number"
                  min={6}
                  step={1}
                  className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedElement.fontSize ?? 48}
                  onChange={(e) => onPatchSelected({ fontSize: parseNumberInput(e.target.value, selectedElement.fontSize ?? 48) } as PresentationElementPatch)}
                />
              </div>
              {/* Font Weight */}
              <div className="flex flex-col gap-1 flex-1 relative">
                <span className="text-[10px] text-zinc-400">Weight</span>
                <button
                  type="button"
                  onClick={() => { setWeightDropdownOpen(!weightDropdownOpen); setFontDropdownOpen(false); }}
                  className="flex w-full items-center justify-between rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-100 hover:border-zinc-500 transition-colors"
                >
                  <span style={{ fontWeight: currentWeight }}>{currentWeightLabel}</span>
                  <ChevronDown className="h-3 w-3 text-zinc-400" />
                </button>
                {weightDropdownOpen && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-md border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden max-h-44 overflow-y-auto">
                    {FONT_WEIGHTS.map((w) => (
                      <button
                        key={w.value}
                        type="button"
                        onClick={() => { onPatchSelected({ fontWeight: w.value as any } as PresentationElementPatch); setWeightDropdownOpen(false); }}
                        className={cn(
                          "flex w-full items-center px-3 py-1.5 text-xs hover:bg-zinc-700 transition-colors",
                          currentWeight === w.value ? "bg-blue-600/20 text-blue-300" : "text-zinc-200"
                        )}
                        style={{ fontWeight: w.value }}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Style toolbar: B, I, U, S */}
            <div className="flex items-center gap-1 mt-2">
              <ToolbarButton
                title="Bold"
                active={textEl?.fontWeight === "700"}
                onClick={() => onPatchSelected({ fontWeight: (textEl?.fontWeight === "700" ? "normal" : "700") } as PresentationElementPatch)}
              >
                <Bold className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton
                title="Italic"
                active={selectedElement.fontStyle === "italic"}
                onClick={() => onPatchSelected({ fontStyle: (selectedElement.fontStyle === "italic" ? "normal" : "italic") } as PresentationElementPatch)}
              >
                <Italic className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton
                title="Underline"
                active={selectedElement.textDecoration === "underline"}
                onClick={() => onPatchSelected({ textDecoration: (selectedElement.textDecoration === "underline" ? "none" : "underline") } as PresentationElementPatch)}
              >
                <Underline className="h-3.5 w-3.5" />
              </ToolbarButton>
              <ToolbarButton
                title="Strikethrough"
                active={selectedElement.textDecoration === "line-through"}
                onClick={() => onPatchSelected({ textDecoration: (selectedElement.textDecoration === "line-through" ? "none" : "line-through") } as PresentationElementPatch)}
              >
                <Strikethrough className="h-3.5 w-3.5" />
              </ToolbarButton>

              <div className="h-4 w-px bg-zinc-600 mx-1" />

              {/* Text Align */}
              {(["left", "center", "right", "justify"] as const).map((align) => {
                const Icon = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify }[align];
                return (
                  <ToolbarButton
                    key={align}
                    title={`Align ${align}`}
                    active={(selectedElement.textAlign || "left") === align}
                    onClick={() => onPatchSelected({ textAlign: align } as PresentationElementPatch)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </ToolbarButton>
                );
              })}
            </div>
          </Section>

          {/* Spacing */}
          <Section label="Spacing">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Line Height</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.6}
                    max={4}
                    step={0.05}
                    className="flex-1 accent-blue-500"
                    value={selectedElement.lineHeight ?? 1.25}
                    onChange={(e) => onPatchSelected({ lineHeight: parseNumberInput(e.target.value, selectedElement.lineHeight ?? 1.25) } as PresentationElementPatch)}
                  />
                  <span className="text-[11px] text-zinc-300 w-8 text-right tabular-nums">
                    {(selectedElement.lineHeight ?? 1.25).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Letter Spacing</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={-5}
                    max={20}
                    step={0.1}
                    className="flex-1 accent-blue-500"
                    value={selectedElement.letterSpacing ?? 0}
                    onChange={(e) => onPatchSelected({ letterSpacing: parseNumberInput(e.target.value, selectedElement.letterSpacing ?? 0) } as PresentationElementPatch)}
                  />
                  <span className="text-[11px] text-zinc-300 w-8 text-right tabular-nums">
                    {(selectedElement.letterSpacing ?? 0).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          </Section>

          {/* Color */}
          <Section label="Color">
            <ColorField
              label="Text Color"
              textAriaLabel="Text Color"
              pickerAriaLabel="Text Color Picker"
              value={selectedElement.color}
              fallback="#ffffff"
              onChange={(v) => onPatchSelected({ color: v } as PresentationElementPatch)}
            />
            <ColorField
              label="Background"
              textAriaLabel="Text Background Color"
              pickerAriaLabel="Text Background Color Picker"
              value={selectedElement.backgroundColor || "transparent"}
              fallback="#000000"
              onChange={(v) => onPatchSelected({ backgroundColor: v } as PresentationElementPatch)}
            />
          </Section>
        </>
      )}

      {/* ── IMAGE / SVG GRAPHIC ── */}
      {selectedElement.type === "image" && (
        <>
          {/* SVG Graphic color picker */}
          {(selectedElement as any).svgContent && (
            <Section label="Graphic Color">
              <div className="flex flex-col gap-2">
                {/* Quick color swatches */}
                <div className="grid grid-cols-8 gap-1">
                  {[
                    "#ffffff", "#f1f5f9", "#fbbf24", "#f87171",
                    "#60a5fa", "#34d399", "#c084fc", "#fb923c",
                    "#000000", "#1e293b", "#92400e", "#991b1b",
                    "#1e3a8a", "#065f46", "#4c1d95", "#7c2d12",
                  ].map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      aria-label={`Set graphic color to ${swatch}`}
                      onClick={() => onPatchSelected({ svgColor: swatch } as PresentationElementPatch)}
                      className="aspect-square w-full rounded-md border-2 transition-all hover:scale-110"
                      style={{
                        backgroundColor: swatch,
                        borderColor: (selectedElement as any).svgColor === swatch ? "#38bdf8" : "transparent",
                      }}
                    />
                  ))}
                </div>
                {/* Custom color input */}
                <label className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-400 shrink-0">Custom</span>
                  <div className="flex flex-1 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1">
                    <input
                      type="color"
                      value={(selectedElement as any).svgColor || "#ffffff"}
                      onChange={(e) => onPatchSelected({ svgColor: e.target.value } as PresentationElementPatch)}
                      className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                      aria-label="Custom graphic color"
                    />
                    <span className="text-xs font-mono text-zinc-300">
                      {(selectedElement as any).svgColor || "#ffffff"}
                    </span>
                  </div>
                </label>
              </div>
            </Section>
          )}
          {/* Regular image info */}
          {!(selectedElement as any).svgContent && (
            <Section label="Image">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">URL</span>
                <input className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 cursor-default" value={selectedElement.src} readOnly aria-label="Image URL" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-400">Alt Text</span>
                <input className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 cursor-default" value={selectedElement.alt} readOnly aria-label="Image Alt Text" />
              </label>
            </Section>
          )}
        </>
      )}


      {/* ── VIDEO ── */}
      {selectedElement.type === "video" && (
        <Section label="Video">
          {[
            { label: "Source URL", field: "src" as const, value: selectedElement.src },
            { label: "Poster URL", field: "poster" as const, value: selectedElement.poster || "" },
            { label: "Title", field: "title" as const, value: selectedElement.title || "" },
          ].map(({ label, field, value }) => (
            <label key={field} className="flex flex-col gap-1">
              <span className="text-[10px] text-zinc-400">{label}</span>
              <input
                aria-label={`Video ${field}`}
                className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={value}
                onChange={(e) => onPatchSelected({ [field]: e.target.value } as PresentationElementPatch)}
              />
            </label>
          ))}
        </Section>
      )}

      {/* ── RECT ── */}
      {selectedElement.type === "rect" && (
        <Section label="Rectangle">
          <ColorField label="Fill" textAriaLabel="Rectangle Fill" pickerAriaLabel="Rectangle Fill Picker" value={selectedElement.fill} fallback="#93c5fd" onChange={(v) => onPatchSelected({ fill: v } as PresentationElementPatch)} />
          <ColorField label="Stroke" textAriaLabel="Rectangle Border" pickerAriaLabel="Rectangle Border Picker" value={selectedElement.stroke || "#2563eb"} fallback="#2563eb" onChange={(v) => onPatchSelected({ stroke: v } as PresentationElementPatch)} />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400">Border Width</span>
            <input type="number" min={0} step={1} aria-label="Rectangle Border Width" className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500" value={selectedElement.strokeWidth ?? 2} onChange={(e) => onPatchSelected({ strokeWidth: parseNumberInput(e.target.value, selectedElement.strokeWidth ?? 2) } as PresentationElementPatch)} />
          </label>
        </Section>
      )}

      {/* ── LINE ── */}
      {selectedElement.type === "line" && (
        <Section label="Line">
          <ColorField label="Fill" textAriaLabel="Line Fill" pickerAriaLabel="Line Fill Picker" value={selectedElement.fill || "transparent"} fallback="#ffffff" onChange={(v) => onPatchSelected({ fill: v } as PresentationElementPatch)} />
          <ColorField label="Stroke" textAriaLabel="Line Stroke" pickerAriaLabel="Line Stroke Picker" value={selectedElement.stroke} fallback="#1f2937" onChange={(v) => onPatchSelected({ stroke: v } as PresentationElementPatch)} />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-400">Stroke Width</span>
            <input type="number" aria-label="Line Stroke Width" className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500" value={selectedElement.strokeWidth} onChange={(e) => onPatchSelected({ strokeWidth: parseNumberInput(e.target.value, selectedElement.strokeWidth) } as PresentationElementPatch)} />
          </label>
        </Section>
      )}
    </div>
  );
}
