import { uiText } from "../content";
import type { CalculationResult } from "../types";
import { calculateDeviation } from "../utils/calculations";
import { formatNumber } from "../utils/format";

type NormComparisonProps = {
  result: CalculationResult;
  normFuelPerHour: number | null;
  fuelAtStart?: number | null;
};

export function NormComparison({
  result,
  normFuelPerHour,
  fuelAtStart,
}: NormComparisonProps) {
  if (!normFuelPerHour || normFuelPerHour <= 0) {
    return null;
  }

  const deviation = calculateDeviation(result.fuelPerHour, normFuelPerHour);
  const percentOfNorm = (result.fuelPerHour / normFuelPerHour) * 100;
  const normFuelForPeriod = normFuelPerHour * (result.minutes / 60);
  const balance = normFuelForPeriod - result.fuelUsed;
  const matchesNorm = Math.abs(balance) < 0.000001;
  const isWithinNorm = balance >= -0.000001;
  const normativeFuelEnd =
    fuelAtStart === null || fuelAtStart === undefined
      ? null
      : fuelAtStart - normFuelForPeriod;

  return (
    <div className="normComparison">
      {deviation !== null && Math.abs(deviation) > 0.000001 ? (
        <p className={deviation < 0 ? "deviation good" : "deviation bad"}>
          {deviation < 0 ? "↓" : "↑"} {formatNumber(percentOfNorm)}{" "}
          {uiText.normComparison.percentOfNorm}
        </p>
      ) : (
        <p className="deviation neutral">
          {uiText.normComparison.matchesNorm}
        </p>
      )}

      {!matchesNorm && (
        <>
          <div className={isWithinNorm ? "normBalance good" : "normBalance bad"}>
            <span>
              {isWithinNorm
                ? uiText.normComparison.reserve
                : uiText.normComparison.overrun}
            </span>
            <b>
              {formatNumber(Math.abs(balance))}{" "}
              {uiText.common.units.kilograms}
            </b>
          </div>

          {normativeFuelEnd !== null && (
            <div className="normBalance neutral">
              <span>{uiText.normComparison.normativeFuelEnd}</span>
              <b>
                {formatNumber(normativeFuelEnd)}{" "}
                {uiText.common.units.kilograms}
              </b>
            </div>
          )}
        </>
      )}
    </div>
  );
}
