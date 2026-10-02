export type HydroDimension = "length" | "discharge" | "rainfall" | "volume";
export interface HydroUnitConversion { readonly dimension: HydroDimension; readonly canonicalUnit: string; readonly factor: number; }
const CONVERSIONS: Readonly<Record<string, HydroUnitConversion>> = {
  m: { dimension: "length", canonicalUnit: "m", factor: 1 },
  cm: { dimension: "length", canonicalUnit: "m", factor: 0.01 },
  mm: { dimension: "rainfall", canonicalUnit: "mm", factor: 1 },
  "m3/s": { dimension: "discharge", canonicalUnit: "m3/s", factor: 1 },
  "m³/s": { dimension: "discharge", canonicalUnit: "m3/s", factor: 1 },
  "m3": { dimension: "volume", canonicalUnit: "m3", factor: 1 },
  "m³": { dimension: "volume", canonicalUnit: "m3", factor: 1 },
};
export function normalizeHydroMeasurement(input: { readonly metric: "water_level" | "discharge" | "rainfall" | "storage" | "inflow" | "outflow"; readonly value: number; readonly unit: string; readonly verticalDatumRef?: string }): { readonly ok: true; readonly rawValue: number; readonly rawUnit: string; readonly normalizedValue: number; readonly normalizedUnit: string; readonly verticalDatumRef?: string } | { readonly ok: false; readonly code: "HYDRO_VALUE_INVALID" | "HYDRO_UNIT_UNSUPPORTED" | "HYDRO_DIMENSION_MISMATCH" | "HYDRO_VERTICAL_DATUM_REQUIRED" } {
  if (!Number.isFinite(input.value)) return { ok: false, code: "HYDRO_VALUE_INVALID" };
  const conversion = CONVERSIONS[input.unit];
  if (!conversion) return { ok: false, code: "HYDRO_UNIT_UNSUPPORTED" };
  const dimension: HydroDimension = input.metric === "water_level" ? "length" : input.metric === "rainfall" ? "rainfall" : input.metric === "discharge" || input.metric === "inflow" || input.metric === "outflow" ? "discharge" : "volume";
  if (conversion.dimension !== dimension) return { ok: false, code: "HYDRO_DIMENSION_MISMATCH" };
  if (input.metric === "water_level" && !input.verticalDatumRef) return { ok: false, code: "HYDRO_VERTICAL_DATUM_REQUIRED" };
  const normalizedValue = input.value * conversion.factor;
  if (!Number.isFinite(normalizedValue)) return { ok: false, code: "HYDRO_VALUE_INVALID" };
  return { ok: true, rawValue: input.value, rawUnit: input.unit, normalizedValue, normalizedUnit: conversion.canonicalUnit, ...(input.verticalDatumRef ? { verticalDatumRef: input.verticalDatumRef } : {}) };
}
