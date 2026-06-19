import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DateInputToolbar } from "../components/DateInputToolbar";
import { uiText } from "../content";
import type { DriverRoute, LocomotiveSection } from "../domain/documents";
import { parseFuel } from "../utils/calculations";
import {
  durationMinutes,
  formatTimeOnly,
  resolveEndDateTime,
} from "../utils/documentTime";
import {
  deleteDocument,
  getDocuments,
  saveDocument,
} from "../utils/documentStorage";
import { calculateDriverRouteTaxation } from "../utils/driverRouteCalculations";
import { formatNumber } from "../utils/format";
import {
  getThuStations,
  getSettings,
  saveThuStation,
  subscribeSettingsChange,
  subscribeThuStationsChange,
} from "../utils/storage";

type SectionForm = {
  id: string;
  series: string;
  locomotiveNumber: string;
  sectionNumber: string;
  fuelAtStart: string;
  fuelAtEnd: string;
};

type StationMode = "none" | "saved" | "new";

type DriverRouteForm = {
  id: string | null;
  routeNumber: string;
  driverName: string;
  departureStation: string;
  departureStationMode: StationMode;
  newDepartureStation: string;
  arrivalStation: string;
  arrivalStationMode: StationMode;
  newArrivalStation: string;
  callTime: string;
  routeStart: string;
  routeEnd: string;
  sections: SectionForm[];
  isZeroRoute: boolean;
  normFuel: string;
  createdAt: string | null;
};

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function createSection(index: number): SectionForm {
  return {
    id: createId(),
    series: "",
    locomotiveNumber: "",
    sectionNumber: String(index + 1),
    fuelAtStart: "",
    fuelAtEnd: "",
  };
}

function createDefaultSections(): SectionForm[] {
  return [createSection(0), createSection(1), createSection(2)];
}

function formatDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function calendarDateTimeValue(value: string): string {
  return normalizeDateTimeInput(value) ?? "";
}

function displayDateTimeInput(value: string): string {
  const normalized = normalizeDateTimeInput(value);
  return normalized ? formatDateTimeInput(normalized) : value;
}

function normalizeDateTimeInput(value: string): string | null {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  const dottedMatch = trimmed.match(
    /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})[,\s]+(\d{1,2}):(\d{2})$/
  );
  const compactMatch = trimmed.match(
    /^(\d{2})(\d{2})(\d{2}|\d{4})\s*(\d{2})(\d{2})$/
  );

  if (isoMatch) {
    const [, year, month, day, hour, minute] = isoMatch;
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}`);
    return Number.isNaN(date.getTime())
      ? null
      : `${year}-${month}-${day}T${hour}:${minute}`;
  }

  const match = dottedMatch ?? compactMatch;
  if (!match) return null;

  const [, day, month, rawYear, rawHour, rawMinute] = match;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const hour = rawHour.padStart(2, "0");
  const minute = rawMinute.padStart(2, "0");
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}`);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) ||
    date.getMinutes() !== Number(minute)
  ) {
    return null;
  }

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function normalizeTimeInput(value: string): string | null {
  const trimmed = value.trim();
  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  const compactMatch = trimmed.match(/^(\d{3,4})$/);

  const hours = colonMatch
    ? Number(colonMatch[1])
    : compactMatch
      ? Number(compactMatch[1].slice(0, -2))
      : NaN;
  const minutes = colonMatch
    ? Number(colonMatch[2])
    : compactMatch
      ? Number(compactMatch[1].slice(-2))
      : NaN;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeRouteEndInput(routeStart: string, routeEnd: string): string | null {
  return normalizeDateTimeInput(routeEnd) ?? resolveEndDateTime(routeStart, normalizeTimeInput(routeEnd) ?? routeEnd);
}

function displayRouteEndInput(value: string): string {
  const normalizedDateTime = normalizeDateTimeInput(value);
  if (normalizedDateTime) return formatDateTimeInput(normalizedDateTime);

  return normalizeTimeInput(value) ?? value;
}

function createForm(): DriverRouteForm {
  return {
    id: null,
    routeNumber: "",
    driverName: "",
    departureStation: "",
    departureStationMode: "none",
    newDepartureStation: "",
    arrivalStation: "",
    arrivalStationMode: "none",
    newArrivalStation: "",
    callTime: "",
    routeStart: "",
    routeEnd: "",
    sections: createDefaultSections(),
    isZeroRoute: false,
    normFuel: "",
    createdAt: null,
  };
}

function toForm(route: DriverRoute): DriverRouteForm {
  return {
    id: route.id,
    routeNumber: route.routeNumber,
    driverName: route.driverName,
    departureStation: route.departureStation ?? "",
    departureStationMode: route.departureStation ? "saved" : "none",
    newDepartureStation: "",
    arrivalStation: route.arrivalStation ?? "",
    arrivalStationMode: route.arrivalStation ? "saved" : "none",
    newArrivalStation: "",
    callTime: route.callTime ? formatDateTimeInput(route.callTime) : "",
    routeStart: formatDateTimeInput(route.routeStart),
    routeEnd:
      durationMinutes(route.routeStart, route.routeEnd) <= 24 * 60
        ? formatTimeOnly(route.routeEnd)
        : formatDateTimeInput(route.routeEnd),
    sections: route.sections.map((section) => ({
      id: section.id,
      series: section.series,
      locomotiveNumber: section.locomotiveNumber,
      sectionNumber: section.sectionNumber,
      fuelAtStart: formatNumber(section.fuelAtStart),
      fuelAtEnd: formatNumber(section.fuelAtEnd),
    })),
    isZeroRoute: route.isZeroRoute,
    normFuel: route.isZeroRoute ? "" : formatNumber(route.normFuel ?? 0),
    createdAt: route.createdAt,
  };
}

function formatRouteDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function parseNorm(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (!/^\d{1,5}([.,]\d{1,3})?$/.test(value.trim())) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function resultLabel(route: DriverRoute): string {
  if (route.creditedResult > 0) return uiText.mmLibrary.economy;
  if (route.creditedResult < 0) return uiText.mmLibrary.overrun;
  return uiText.mmLibrary.zero;
}

function routeResultClass(route: DriverRoute): string {
  if (route.creditedResult > 0) return "good";
  if (route.creditedResult < 0) return "bad";
  return "neutral";
}

function sectionFuelDelta(section: SectionForm): number | null {
  const start = parseFuel(section.fuelAtStart);
  const end = parseFuel(section.fuelAtEnd);
  return start !== null && end !== null ? start - end : null;
}

function savedRouteSectionFuelClass(section: LocomotiveSection): string {
  const delta = section.fuelAtStart - section.fuelAtEnd;
  if (delta < 0) return "sectionFuelResult bad";
  if (delta === 0) return "sectionFuelResult neutral";
  return "sectionFuelResult good";
}

function getSelectedStation(
  mode: StationMode,
  savedStation: string,
  newStation: string
): string {
  return mode === "new" ? newStation.trim() : savedStation.trim();
}

function StationSelect({
  label,
  mode,
  station,
  newStation,
  stations,
  onChange,
}: {
  label: string;
  mode: StationMode;
  station: string;
  newStation: string;
  stations: string[];
  onChange: (patch: {
    mode?: StationMode;
    station?: string;
    newStation?: string;
  }) => void;
}) {
  const stationOptions = [
    ...new Set([station, ...stations].filter((item): item is string => Boolean(item))),
  ];

  return (
    <>
      <label className="field">
        <span>{label}</span>
        <select
          className="selectInput"
          value={mode === "new" ? "__new" : mode === "none" ? "__none" : station}
          onChange={(event) => {
            const value = event.target.value;
            onChange({
              station: value === "__new" || value === "__none" ? "" : value,
              mode:
                value === "__new"
                  ? "new"
                  : value === "__none"
                    ? "none"
                    : "saved",
            });
          }}
        >
          <option value="__none">{uiText.mmLibrary.noStation}</option>
          {stationOptions.map((item) => (
            <option value={item} key={item}>
              {item}
            </option>
          ))}
          <option value="__new">{uiText.mmLibrary.addStation}</option>
        </select>
      </label>
      {mode === "new" && (
        <label className="field">
          <span>{uiText.mmLibrary.newStation}</span>
          <input
            value={newStation}
            onChange={(event) => onChange({ newStation: event.target.value })}
          />
        </label>
      )}
    </>
  );
}

export function DriverRouteLibraryScreen() {
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [form, setForm] = useState<DriverRouteForm | null>(null);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [stations, setStations] = useState(() => getThuStations());
  const [settings, setSettings] = useState(() => getSettings());

  async function loadRoutes() {
    try {
      const stored = await getDocuments("driverRoutes");
      setRoutes(
        stored.sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt)
        )
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRoutes();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => subscribeThuStationsChange(() => setStations(getThuStations())), []);

  useEffect(() => subscribeSettingsChange(() => setSettings(getSettings())), []);

  function updateSection(index: number, patch: Partial<SectionForm>) {
    if (!form) return;
    setForm({
      ...form,
      sections: form.sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section
      ),
    });
  }

  const sectionPreview = useMemo(() => {
    if (!form) return null;

    const sections = form.sections.map<number | null>((section) => {
      const fuelAtStart = parseFuel(section.fuelAtStart);
      const fuelAtEnd = parseFuel(section.fuelAtEnd);
      return fuelAtStart !== null &&
        fuelAtEnd !== null &&
        fuelAtEnd <= fuelAtStart
        ? fuelAtStart - fuelAtEnd
        : null;
    });

    return sections.every((value): value is number => value !== null)
      ? sections.reduce((sum, value) => sum + value, 0)
      : null;
  }, [form]);

  const taxationPreview =
    form && sectionPreview !== null
      ? calculateDriverRouteTaxation(
          form.isZeroRoute ? sectionPreview : (parseNorm(form.normFuel) ?? -1),
          sectionPreview,
          form.isZeroRoute
        )
      : null;
  const useCalendarInput = settings.dateTimeInputMode === "calendar";
  const showDateToolbar = settings.dateTimeInputMode === "friendly";
  const dateTimePlaceholder =
    settings.dateTimeInputMode === "asu"
      ? "0101260100"
      : "01.01.26 01:00";
  const routeEndPlaceholder =
    settings.dateTimeInputMode === "asu"
      ? "0500 или 0101260500"
      : uiText.mmLibrary.routeEndPlaceholder;

  function validateSections(): {
    sections: LocomotiveSection[] | null;
    error: string;
  } {
    if (!form) {
      return { sections: null, error: uiText.mmLibrary.requiredFields };
    }

    let validationError = "";
    const firstSection = form.sections[0];
    const sections = form.sections.map<LocomotiveSection | null>(
      (section, index) => {
        const series =
          section.series.trim() || (index > 0 ? firstSection.series.trim() : "");
        const locomotiveNumber =
          section.locomotiveNumber.trim() ||
          (index > 0 ? firstSection.locomotiveNumber.trim() : "");
        const fuelAtStart = parseFuel(section.fuelAtStart);
        const fuelAtEnd = parseFuel(section.fuelAtEnd);

        if (
          !series ||
          !locomotiveNumber ||
          !section.sectionNumber.trim() ||
          fuelAtStart === null ||
          fuelAtEnd === null
        ) {
          validationError = uiText.mmLibrary.requiredFields;
          return null;
        }

        if (fuelAtEnd > fuelAtStart) {
          validationError = uiText.mmLibrary.fuelDecrease;
          return null;
        }

        return {
          id: section.id,
          series,
          locomotiveNumber,
          sectionNumber: section.sectionNumber.trim(),
          fuelAtStart,
          fuelAtEnd,
          fuelAdded: null,
        };
      }
    );

    const validSections = sections.every(
      (section): section is LocomotiveSection => section !== null
    )
      ? sections
      : null;

    return {
      sections: validSections,
      error: validSections ? "" : validationError,
    };
  }

  async function handleSave() {
    if (!form) return;
    setError("");

    if (!form.routeNumber.trim() || !form.routeStart || !form.routeEnd) {
      setError(uiText.mmLibrary.requiredFields);
      return;
    }

    const routeStartValue = normalizeDateTimeInput(form.routeStart);
    const routeEndValue = routeStartValue
      ? normalizeRouteEndInput(routeStartValue, form.routeEnd)
      : null;
    const callTimeValue = form.callTime.trim()
      ? normalizeDateTimeInput(form.callTime)
      : null;

    if (
      !routeStartValue ||
      !routeEndValue ||
      (form.callTime.trim() && !callTimeValue)
    ) {
      setError(uiText.mmLibrary.invalidPeriod);
      return;
    }

    const sectionValidation = validateSections();
    if (!sectionValidation.sections) {
      setError(sectionValidation.error);
      return;
    }

    const actualFuel = sectionValidation.sections.reduce(
      (sum, section) => sum + section.fuelAtStart - section.fuelAtEnd,
      0
    );
    const normFuel = form.isZeroRoute ? actualFuel : parseNorm(form.normFuel);

    if (normFuel === null) {
      setError(uiText.mmLibrary.normError);
      return;
    }

    const taxation = calculateDriverRouteTaxation(
      normFuel,
      actualFuel,
      form.isZeroRoute
    );
    if (!taxation) {
      setError(uiText.mmLibrary.normError);
      return;
    }

    const departureStation = getSelectedStation(
      form.departureStationMode,
      form.departureStation,
      form.newDepartureStation
    );
    const arrivalStation = getSelectedStation(
      form.arrivalStationMode,
      form.arrivalStation,
      form.newArrivalStation
    );
    const now = new Date().toISOString();
    const route: DriverRoute = {
      id: form.id ?? createId(),
      routeNumber: form.routeNumber.trim(),
      driverName: form.driverName.trim(),
      departureStation: departureStation || undefined,
      arrivalStation: arrivalStation || undefined,
      callTime: callTimeValue ?? undefined,
      routeStart: routeStartValue,
      routeEnd: routeEndValue,
      sections: sectionValidation.sections,
      isZeroRoute: form.isZeroRoute,
      normFuel: taxation.normFuel,
      actualFuel: taxation.actualFuel,
      creditedResult: taxation.creditedResult,
      createdAt: form.createdAt ?? now,
      updatedAt: now,
    };

    try {
      await saveDocument("driverRoutes", route);
      if (departureStation) saveThuStation(departureStation);
      if (arrivalStation) saveThuStation(arrivalStation);
      setForm(null);
      await loadRoutes();
    } catch {
      setStorageError(true);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDocument("driverRoutes", id);
      if (form?.id === id) setForm(null);
      await loadRoutes();
    } catch {
      setStorageError(true);
    }
  }

  return (
    <section className="screen">
      <div className="card">
        <div className="libraryHeader">
          <div className="sectionTitle">
            <h2>{uiText.mmLibrary.title}</h2>
            <p>{uiText.mmLibrary.description}</p>
          </div>

          {!form && (
            <button
              className="primaryIconButton"
              type="button"
              onClick={() => {
                setError("");
                setForm(createForm());
              }}
            >
              <Plus size={19} />
              {uiText.mmLibrary.add}
            </button>
          )}
        </div>

        {storageError && (
          <div className="errorBox">{uiText.mmLibrary.storageError}</div>
        )}

        {form && (
          <div className="documentForm">
            <div className="documentFormHeader">
              <h3>{form.id ? uiText.mmLibrary.edit : uiText.mmLibrary.add}</h3>
              <button
                className="iconButton"
                type="button"
                aria-label={uiText.mmLibrary.cancel}
                onClick={() => setForm(null)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="thuHeaderCard">
              <div className="twoColumnGrid">
                <label className="field">
                  <span>{uiText.mmLibrary.routeNumber}</span>
                  <input
                    value={form.routeNumber}
                    inputMode="numeric"
                    onChange={(event) =>
                      setForm({ ...form, routeNumber: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>{uiText.mmLibrary.driverName}</span>
                  <input
                    value={form.driverName}
                    onChange={(event) =>
                      setForm({ ...form, driverName: event.target.value })
                    }
                  />
                </label>
              </div>

              <div className="twoColumnGrid">
                <StationSelect
                  label={uiText.mmLibrary.departureStation}
                  mode={form.departureStationMode}
                  station={form.departureStation}
                  newStation={form.newDepartureStation}
                  stations={stations}
                  onChange={(patch) =>
                    setForm({
                      ...form,
                      departureStationMode:
                        patch.mode ?? form.departureStationMode,
                      departureStation: patch.station ?? form.departureStation,
                      newDepartureStation:
                        patch.newStation ?? form.newDepartureStation,
                    })
                  }
                />
                <StationSelect
                  label={uiText.mmLibrary.arrivalStation}
                  mode={form.arrivalStationMode}
                  station={form.arrivalStation}
                  newStation={form.newArrivalStation}
                  stations={stations}
                  onChange={(patch) =>
                    setForm({
                      ...form,
                      arrivalStationMode: patch.mode ?? form.arrivalStationMode,
                      arrivalStation: patch.station ?? form.arrivalStation,
                      newArrivalStation:
                        patch.newStation ?? form.newArrivalStation,
                    })
                  }
                />
              </div>

              <div className="threeColumnGrid">
                <label className="field">
                  <span>{uiText.mmLibrary.callTime}</span>
                  <input
                    type={useCalendarInput ? "datetime-local" : "text"}
                    value={
                      useCalendarInput
                        ? calendarDateTimeValue(form.callTime)
                        : form.callTime
                    }
                    inputMode={useCalendarInput ? undefined : "numeric"}
                    placeholder={dateTimePlaceholder}
                    onChange={(event) =>
                      setForm({ ...form, callTime: event.target.value })
                    }
                    onBlur={() =>
                      setForm({
                        ...form,
                        callTime: displayDateTimeInput(form.callTime),
                      })
                    }
                  />
                  <DateInputToolbar
                    hidden={!showDateToolbar || useCalendarInput}
                    onInsert={(value) =>
                      setForm({ ...form, callTime: `${form.callTime}${value}` })
                    }
                  />
                </label>
                <label className="field">
                  <span>{uiText.mmLibrary.routeStart}</span>
                  <input
                    type={useCalendarInput ? "datetime-local" : "text"}
                    value={
                      useCalendarInput
                        ? calendarDateTimeValue(form.routeStart)
                        : form.routeStart
                    }
                    inputMode={useCalendarInput ? undefined : "numeric"}
                    placeholder={dateTimePlaceholder}
                    onChange={(event) =>
                      setForm({ ...form, routeStart: event.target.value })
                    }
                    onBlur={() =>
                      setForm({
                        ...form,
                        routeStart: displayDateTimeInput(form.routeStart),
                      })
                    }
                  />
                  <DateInputToolbar
                    hidden={!showDateToolbar || useCalendarInput}
                    onInsert={(value) =>
                      setForm({
                        ...form,
                        routeStart: `${form.routeStart}${value}`,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>{uiText.mmLibrary.routeEnd}</span>
                  <input
                    type={useCalendarInput ? "datetime-local" : "text"}
                    value={
                      useCalendarInput
                        ? calendarDateTimeValue(form.routeEnd)
                        : form.routeEnd
                    }
                    inputMode={useCalendarInput ? undefined : "numeric"}
                    placeholder={routeEndPlaceholder}
                    onChange={(event) =>
                      setForm({ ...form, routeEnd: event.target.value })
                    }
                    onBlur={() =>
                      setForm({
                        ...form,
                        routeEnd: displayRouteEndInput(form.routeEnd),
                      })
                    }
                  />
                  <DateInputToolbar
                    hidden={!showDateToolbar || useCalendarInput}
                    onInsert={(value) =>
                      setForm({ ...form, routeEnd: `${form.routeEnd}${value}` })
                    }
                  />
                </label>
              </div>

              <label className="toggleField">
                <input
                  type="checkbox"
                  checked={form.isZeroRoute}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      isZeroRoute: event.target.checked,
                      normFuel: event.target.checked ? "" : form.normFuel,
                    })
                  }
                />
                <span>
                  <b>{uiText.mmLibrary.zeroRoute}</b>
                  <small>{uiText.mmLibrary.zeroRouteHint}</small>
                </span>
              </label>
            </div>

            <div className="thuOperationCard">
              <b>Секции</b>
              <div className="thuSectionsTableWrap">
                <table className="thuSectionsTable">
                  <thead>
                    <tr>
                      <th>Серия</th>
                      <th>№</th>
                      <th>Секц.</th>
                      <th>Приём</th>
                      <th>Сдача</th>
                      <th>Расход</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {form.sections.map((section, index) => {
                      const delta = sectionFuelDelta(section);
                      const firstSection = form.sections[0];
                      const inherited =
                        index > 0 &&
                        (!section.series || !section.locomotiveNumber);

                      return (
                        <tr key={section.id}>
                          <td data-label="Серия">
                            <input
                              value={section.series}
                              placeholder={
                                inherited ? firstSection.series : undefined
                              }
                              onChange={(event) =>
                                updateSection(index, {
                                  series: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td data-label="№">
                            <input
                              value={section.locomotiveNumber}
                              placeholder={
                                inherited
                                  ? firstSection.locomotiveNumber
                                  : undefined
                              }
                              inputMode="numeric"
                              onChange={(event) =>
                                updateSection(index, {
                                  locomotiveNumber: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td data-label="Секция">
                            <input
                              value={section.sectionNumber}
                              inputMode="numeric"
                              onChange={(event) =>
                                updateSection(index, {
                                  sectionNumber: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td data-label="Приём">
                            <input
                              value={section.fuelAtStart}
                              inputMode="decimal"
                              onChange={(event) =>
                                updateSection(index, {
                                  fuelAtStart: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td data-label="Сдача">
                            <input
                              value={section.fuelAtEnd}
                              inputMode="decimal"
                              onChange={(event) =>
                                updateSection(index, {
                                  fuelAtEnd: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td data-label="Расход">
                            <span
                              className={
                                delta === null
                                  ? "sectionFuelResult"
                                  : delta < 0
                                    ? "sectionFuelResult bad"
                                    : delta === 0
                                      ? "sectionFuelResult neutral"
                                      : "sectionFuelResult good"
                              }
                            >
                              {delta === null
                                ? uiText.common.emptyValue
                                : formatNumber(delta)}
                            </span>
                          </td>
                          <td className="thuSectionActions">
                            {form.sections.length > 1 && (
                              <button
                                className="iconDangerButton mini"
                                type="button"
                                aria-label={uiText.mmLibrary.removeSection}
                                onClick={() =>
                                  setForm({
                                    ...form,
                                    sections: form.sections.filter(
                                      (item) => item.id !== section.id
                                    ),
                                  })
                                }
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {form.sections.length < 3 && (
                <button
                  className="secondaryButton compact thuInlineAction"
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      sections: [...form.sections, createSection(form.sections.length)],
                    })
                  }
                >
                  <Plus size={18} />
                  {uiText.mmLibrary.addSection}
                </button>
              )}
            </div>

            <div className="taxationPreview">
              {!form.isZeroRoute && (
                <label className="field">
                  <span>{uiText.mmLibrary.normFuel}</span>
                  <input
                    value={form.normFuel}
                    inputMode="decimal"
                    onChange={(event) =>
                      setForm({ ...form, normFuel: event.target.value })
                    }
                  />
                </label>
              )}
              {taxationPreview && (
                <>
                  <span>
                    {uiText.mmLibrary.actualFuel}:{" "}
                    <b>{formatNumber(taxationPreview.actualFuel)} кг</b>
                  </span>
                  <span>
                    {uiText.mmLibrary.normFuel}:{" "}
                    <b>{formatNumber(taxationPreview.normFuel)} кг</b>
                  </span>
                  <span
                    className={
                      taxationPreview.resultType === "economy"
                        ? "good"
                        : taxationPreview.resultType === "overrun"
                          ? "bad"
                          : "neutral"
                    }
                  >
                    {taxationPreview.resultType === "economy"
                      ? uiText.mmLibrary.economy
                      : taxationPreview.resultType === "overrun"
                        ? uiText.mmLibrary.overrun
                        : uiText.mmLibrary.zero}
                    :{" "}
                    <b>
                      {formatNumber(Math.abs(taxationPreview.creditedResult))} кг
                    </b>
                  </span>
                </>
              )}
            </div>

            {error && <div className="errorBox">{error}</div>}

            <div className="documentFormActions">
              <button
                className="primaryButton"
                type="button"
                onClick={() => void handleSave()}
              >
                {uiText.mmLibrary.save}
              </button>
              <button
                className="secondaryButton compact"
                type="button"
                onClick={() => setForm(null)}
              >
                {uiText.mmLibrary.cancel}
              </button>
            </div>
          </div>
        )}

        {!form && routes.length === 0 && !storageError && (
          <p className="emptyHistory">{uiText.mmLibrary.empty}</p>
        )}

        {!form && routes.length > 0 && (
          <div className="documentList">
            {routes.map((route) => (
              <article className="documentCard" key={route.id}>
                <div className="documentCardHeader">
                  <div>
                    <b>
                      ММ № {route.routeNumber} ·{" "}
                      {route.driverName || uiText.mmLibrary.withoutDriver}
                    </b>
                    <p>
                      {[route.departureStation, route.arrivalStation]
                        .filter(Boolean)
                        .join(" → ") || "Станции не указаны"}
                    </p>
                  </div>
                  <div className="documentCardActions">
                    <button
                      className="iconButton"
                      type="button"
                      aria-label={uiText.mmLibrary.editAction}
                      onClick={() => {
                        setError("");
                        setForm(toForm(route));
                      }}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="iconDangerButton"
                      type="button"
                      aria-label={uiText.mmLibrary.delete}
                      onClick={() => void handleDelete(route.id)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>

                <p className="documentPeriod">
                  {route.callTime && `Явка: ${formatRouteDate(route.callTime)} · `}
                  {uiText.mmLibrary.routeStart}: {formatRouteDate(route.routeStart)} →{" "}
                  {uiText.mmLibrary.routeEnd}: {formatRouteDate(route.routeEnd)}
                </p>

                <div className="routeTaxation">
                  <span>
                    {uiText.mmLibrary.normFuel}:{" "}
                    <b>{formatNumber(route.normFuel ?? 0)} кг</b>
                  </span>
                  <span>
                    {uiText.mmLibrary.actualFuel}:{" "}
                    <b>{formatNumber(route.actualFuel)} кг</b>
                  </span>
                  <span className={routeResultClass(route)}>
                    {resultLabel(route)}:{" "}
                    <b>{formatNumber(Math.abs(route.creditedResult))} кг</b>
                  </span>
                </div>

                <div className="thuSavedTableWrap">
                  <table className="thuSavedTable">
                    <thead>
                      <tr>
                        <th>Тепловоз</th>
                        <th>Секц.</th>
                        <th>Приём</th>
                        <th>Сдача</th>
                        <th>Расход</th>
                      </tr>
                    </thead>
                    <tbody>
                      {route.sections.map((section) => (
                        <tr key={section.id}>
                          <td data-label="Тепловоз">
                            {section.series}-{section.locomotiveNumber}
                          </td>
                          <td data-label="Секц.">{section.sectionNumber}</td>
                          <td data-label="Приём">
                            {formatNumber(section.fuelAtStart)}
                          </td>
                          <td data-label="Сдача">
                            {formatNumber(section.fuelAtEnd)}
                          </td>
                          <td data-label="Расход">
                            <span className={savedRouteSectionFuelClass(section)}>
                              {formatNumber(section.fuelAtStart - section.fuelAtEnd)} кг
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
