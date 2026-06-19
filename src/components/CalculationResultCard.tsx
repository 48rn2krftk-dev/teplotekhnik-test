import type { ReactNode } from "react";
import { uiText } from "../content";
import type { CalculationResult } from "../types";
import { formatNumber, formatTime } from "../utils/format";

type ResultLabels = {
  time: string;
  fuel: string;
  fuelPerHour: string;
};

type CalculationResultCardProps = {
  result: CalculationResult | null;
  labels?: ResultLabels;
  children?: ReactNode;
};

const defaultLabels: ResultLabels = {
  time: uiText.common.result.heatingTime,
  fuel: uiText.common.result.fuelUsed,
  fuelPerHour: uiText.common.result.fuelPerHour,
};

export function CalculationResultCard({
  result,
  labels = defaultLabels,
  children,
}: CalculationResultCardProps) {
  return (
    <div className="resultCard">
      <p>
        {labels.time}:{" "}
        {result ? formatTime(result.minutes) : uiText.common.emptyValue}
      </p>
      <p>
        {labels.fuel}:{" "}
        {result
          ? `${formatNumber(result.fuelUsed)} ${uiText.common.units.kilograms}`
          : uiText.common.emptyValue}
      </p>
      <p>
        {labels.fuelPerHour}:{" "}
        {result
          ? `${formatNumber(result.fuelPerHour)} ${uiText.common.units.kilogramsPerHour}`
          : uiText.common.emptyValue}
      </p>

      {children}
    </div>
  );
}
