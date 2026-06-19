export type DriverRouteTaxation = {
  normFuel: number;
  actualFuel: number;
  creditedResult: number;
  resultType: "economy" | "overrun" | "zero";
};

function roundToTenths(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function calculateDriverRouteTaxation(
  normFuel: number,
  actualFuel: number,
  isZeroRoute: boolean
): DriverRouteTaxation | null {
  if (normFuel < 0 || actualFuel < 0) return null;

  if (isZeroRoute) {
    return {
      normFuel: actualFuel,
      actualFuel,
      creditedResult: 0,
      resultType: "zero",
    };
  }

  if (actualFuel > normFuel) {
    return {
      normFuel,
      actualFuel,
      creditedResult: roundToTenths(normFuel - actualFuel),
      resultType: "overrun",
    };
  }

  const creditedEconomy = Math.min(
    actualFuel / 9,
    normFuel - actualFuel,
    normFuel / 10
  );

  return {
    normFuel,
    actualFuel,
    creditedResult: roundToTenths(creditedEconomy),
    resultType: creditedEconomy === 0 ? "zero" : "economy",
  };
}
