import type { CalculationResult } from "../types";

export function parseFuel(value: string): number | null {
  const normalized = value.replace(",", ".").trim();

  if (!/^\d{1,4}([.,]\d{1,3})?$/.test(value.trim())) {
    return null;
  }

  const num = Number(normalized);

  if (Number.isNaN(num) || num < 0 || num > 9999.999) {
    return null;
  }

  return num;
}

export function calculateByFuelDifference(
  minutes: number,
  fuelStart: number,
  fuelEnd: number
): CalculationResult | null {
  if (minutes <= 0) return null;
  if (fuelEnd > fuelStart) return null;

  const fuelUsed = fuelStart - fuelEnd;
  const hours = minutes / 60;

  return {
    minutes,
    fuelUsed,
    fuelPerHour: fuelUsed / hours,
  };
}

export function calculateManual(
  minutes: number,
  fuelUsed: number
): CalculationResult | null {
  if (minutes <= 0 || fuelUsed < 0) return null;

  const hours = minutes / 60;

  return {
    minutes,
    fuelUsed,
    fuelPerHour: fuelUsed / hours,
  };
}

export function calculateDeviation(
  fact: number,
  norm: number | null
): number | null {
  if (!norm || norm <= 0) return null;
  return ((fact - norm) / norm) * 100;
}