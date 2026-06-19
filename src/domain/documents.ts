export type LocomotiveSection = {
  id: string;
  series: string;
  locomotiveNumber: string;
  sectionNumber: string;
  fuelAtStart: number;
  fuelAtEnd: number;
  fuelAdded: number | null;
};

export type ThuOperationType =
  | "idle"
  | "maneuvers"
  | "depotHeating"
  | "stationHeating"
  | "fueling";

export type ThuOperation = {
  id: string;
  documentGroupId?: string;
  documentNumber: string;
  driverName?: string;
  station?: string;
  shiftStart: string;
  shiftEnd: string;
  operationType: ThuOperationType;
  operationStart: string;
  operationEnd: string;
  sections: LocomotiveSection[];
  createdAt: string;
  updatedAt: string;
};

export type DriverRoute = {
  id: string;
  routeNumber: string;
  driverName: string;
  departureStation?: string;
  arrivalStation?: string;
  callTime?: string;
  routeStart: string;
  routeEnd: string;
  sections: LocomotiveSection[];
  isZeroRoute: boolean;
  normFuel: number | null;
  actualFuel: number;
  creditedResult: number;
  createdAt: string;
  updatedAt: string;
};

export type FuelChain = {
  id: string;
  title: string;
  itemIds: Array<{
    type: "thu" | "driverRoute";
    id: string;
  }>;
  tankCapacity: number | null;
  corrections?: FuelChainCorrection[];
  createdAt: string;
  updatedAt: string;
};

export type FuelChainCorrection = {
  type: "thu" | "driverRoute";
  documentId: string;
  operationStart?: string;
  operationEnd?: string;
  sections: Array<{
    sectionKey: string;
    fuelAtStart: number;
    fuelAtEnd: number;
  }>;
};
