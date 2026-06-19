import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DateInputToolbar } from "../components/DateInputToolbar";
import { NormComparison } from "../components/NormComparison";
import { uiText } from "../content";
import type {
  LocomotiveSection,
  ThuOperation,
  ThuOperationType,
} from "../domain/documents";
import { calculateManual, parseFuel } from "../utils/calculations";
import {
  durationMinutes,
  formatTimeOnly,
  resolveEndDateTime,
  resolveTimeInsidePeriod,
} from "../utils/documentTime";
import {
  deleteDocument,
  getDocuments,
  saveDocument,
} from "../utils/documentStorage";
import { formatNumber, formatTime } from "../utils/format";
import {
  getSettings,
  getThuStations,
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
  fuelAdded: string;
};

type ThuOperationForm = {
  localId: string;
  id: string | null;
  operationType: ThuOperationType;
  operationStart: string;
  operationEnd: string;
  sections: SectionForm[];
  createdAt: string | null;
};

type ThuForm = {
  documentGroupId: string | null;
  documentNumber: string;
  driverName: string;
  station: string;
  stationMode: "none" | "saved" | "new";
  newStation: string;
  shiftDate: string;
  shiftStart: string;
  shiftEnd: string;
  operations: ThuOperationForm[];
};

type ThuGroup = {
  id: string;
  operations: ThuOperation[];
};

const operationTypes: ThuOperationType[] = ["idle", "fueling"];

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function formatDateInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function calendarDateValue(value: string): string {
  return normalizeDateInput(value) ?? "";
}

function calendarTimeValue(value: string): string {
  return normalizeTimeInput(value) ?? "";
}

function displayDateInput(value: string): string {
  const normalized = normalizeDateInput(value);
  return normalized ? formatDateInput(normalized) : value;
}

function displayTimeInput(value: string): string {
  return normalizeTimeInput(value) ?? value;
}

function normalizeDateInput(value: string): string | null {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dottedMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);
  const compactMatch = trimmed.match(/^(\d{2})(\d{2})(\d{2}|\d{4})$/);
  const match = isoMatch ?? dottedMatch ?? compactMatch;

  if (!match) return null;

  if (match === isoMatch) {
    const [, year, month, day] = match;
    const date = new Date(`${year}-${month}-${day}T00:00`);
    return Number.isNaN(date.getTime()) ? null : `${year}-${month}-${day}`;
  }

  const [, day, month, rawYear] = match;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const date = new Date(`${year}-${month}-${day}T00:00`);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
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

function createSection(index: number): SectionForm {
  return {
    id: createId(),
    series: "",
    locomotiveNumber: "",
    sectionNumber: String(index + 1),
    fuelAtStart: "",
    fuelAtEnd: "",
    fuelAdded: "",
  };
}

function createDefaultSections(): SectionForm[] {
  return [createSection(0), createSection(1), createSection(2)];
}

function createOperationForm(): ThuOperationForm {
  return {
    localId: createId(),
    id: null,
    operationType: "idle",
    operationStart: "",
    operationEnd: "",
    sections: createDefaultSections(),
    createdAt: null,
  };
}

function createForm(): ThuForm {
  return {
    documentGroupId: null,
    documentNumber: "",
    driverName: "",
    station: "",
    stationMode: "none",
    newStation: "",
    shiftDate: "",
    shiftStart: "",
    shiftEnd: "",
    operations: [createOperationForm()],
  };
}

function sectionToForm(section: LocomotiveSection): SectionForm {
  return {
    id: section.id,
    series: section.series,
    locomotiveNumber: section.locomotiveNumber,
    sectionNumber: section.sectionNumber,
    fuelAtStart: formatNumber(section.fuelAtStart),
    fuelAtEnd: formatNumber(section.fuelAtEnd),
    fuelAdded: section.fuelAdded === null ? "" : formatNumber(section.fuelAdded),
  };
}

function toForm(group: ThuGroup): ThuForm {
  const operations = [...group.operations].sort((left, right) =>
    left.operationStart.localeCompare(right.operationStart)
  );
  const first = operations[0];
  const station = first.station ?? "";

  return {
    documentGroupId: group.id,
    documentNumber: first.documentNumber,
    driverName: first.driverName ?? "",
    station,
    stationMode: station ? "saved" : "none",
    newStation: "",
    shiftDate: formatDateInput(first.shiftStart),
    shiftStart: formatTimeOnly(first.shiftStart),
    shiftEnd: formatTimeOnly(first.shiftEnd),
    operations: operations.map((operation) => ({
      localId: createId(),
      id: operation.id,
      operationType: operation.operationType === "fueling" ? "fueling" : "idle",
      operationStart: formatTimeOnly(operation.operationStart),
      operationEnd: formatTimeOnly(operation.operationEnd),
      sections: operation.sections.map(sectionToForm),
      createdAt: operation.createdAt,
    })),
  };
}

function groupOperations(operations: ThuOperation[]): ThuGroup[] {
  const groups = new Map<string, ThuOperation[]>();

  operations.forEach((operation) => {
    const groupId = operation.documentGroupId ?? operation.id;
    groups.set(groupId, [...(groups.get(groupId) ?? []), operation]);
  });

  return [...groups.entries()]
    .map(([id, groupItems]) => ({
      id,
      operations: groupItems.sort((left, right) =>
        left.operationStart.localeCompare(right.operationStart)
      ),
    }))
    .sort((left, right) =>
      right.operations[0].updatedAt.localeCompare(left.operations[0].updatedAt)
    );
}

function formatOperationDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getHotIdleCalculation(operation: ThuOperation) {
  if (operation.operationType === "fueling") return null;

  const minutes = durationMinutes(
    operation.operationStart,
    operation.operationEnd
  );
  const fuelUsed = operation.sections.reduce(
    (sum, section) => sum + section.fuelAtStart - section.fuelAtEnd,
    0
  );

  return calculateManual(minutes, fuelUsed);
}

function getGroupHotIdleCalculation(operations: ThuOperation[]) {
  const calculations = operations
    .map(getHotIdleCalculation)
    .filter((calculation): calculation is NonNullable<typeof calculation> =>
      Boolean(calculation)
    );

  const minutes = calculations.reduce(
    (sum, calculation) => sum + calculation.minutes,
    0
  );
  const fuelUsed = calculations.reduce(
    (sum, calculation) => sum + calculation.fuelUsed,
    0
  );

  return minutes > 0 ? calculateManual(minutes, fuelUsed) : null;
}

function formOperationCalculation(
  operation: ThuOperationForm,
  shiftDate: string,
  shiftStart: string
) {
  const periodStart = shiftStart
    ? `${shiftDate}T${shiftStart}`
    : `${shiftDate}T00:00`;
  const operationStart = resolveTimeInsidePeriod(
    periodStart,
    operation.operationStart
  );
  const operationEnd = operationStart
    ? resolveTimeInsidePeriod(
        periodStart,
        operation.operationEnd,
        operationStart
      )
    : null;

  if (!operationStart || !operationEnd || operation.operationType === "fueling") {
    return null;
  }

  const fuelValues = operation.sections.map((section) => {
    const start = parseFuel(section.fuelAtStart);
    const end = parseFuel(section.fuelAtEnd);
    return start !== null && end !== null && end <= start ? start - end : null;
  });

  if (!fuelValues.every((value): value is number => value !== null)) {
    return null;
  }

  return calculateManual(
    durationMinutes(operationStart, operationEnd),
    fuelValues.reduce((sum, value) => sum + value, 0)
  );
}

function formTotalCalculation(form: ThuForm) {
  const shiftDate = normalizeDateInput(form.shiftDate);
  const shiftStart = normalizeTimeInput(form.shiftStart);
  if (!shiftDate || !shiftStart) return null;

  const calculations = form.operations
    .map((operation) =>
      formOperationCalculation(operation, shiftDate, shiftStart)
    )
    .filter((calculation): calculation is NonNullable<typeof calculation> =>
      Boolean(calculation)
    );
  const minutes = calculations.reduce(
    (sum, calculation) => sum + calculation.minutes,
    0
  );
  const fuelUsed = calculations.reduce(
    (sum, calculation) => sum + calculation.fuelUsed,
    0
  );

  return minutes > 0 ? calculateManual(minutes, fuelUsed) : null;
}

function sectionFuelDelta(section: SectionForm): number | null {
  const start = parseFuel(section.fuelAtStart);
  const end = parseFuel(section.fuelAtEnd);

  return start !== null && end !== null ? start - end : null;
}

function calculateFuelingEnd(section: SectionForm): string | null {
  const start = parseFuel(section.fuelAtStart);
  const added = parseFuel(section.fuelAdded);

  return start !== null && added !== null ? formatNumber(start + added) : null;
}

function calculateFuelingAdded(section: SectionForm): string | null {
  const start = parseFuel(section.fuelAtStart);
  const end = parseFuel(section.fuelAtEnd);

  return start !== null && end !== null ? formatNumber(end - start) : null;
}

function sectionFuelClass(
  section: SectionForm,
  operationCalculation: ReturnType<typeof formOperationCalculation>,
  normFuelPerHour: number | null
): string {
  const delta = sectionFuelDelta(section);
  if (delta === null) return "sectionFuelResult";
  if (delta < 0) return "sectionFuelResult bad";
  if (delta === 0 || !operationCalculation || normFuelPerHour === null) {
    return "sectionFuelResult neutral";
  }

  const sectionFuelPerHour = (delta * 60) / operationCalculation.minutes;

  return sectionFuelPerHour > normFuelPerHour
    ? "sectionFuelResult bad"
    : "sectionFuelResult good";
}

function savedSectionFuelClass(
  operation: ThuOperation,
  section: LocomotiveSection,
  normFuelPerHour: number | null
): string {
  if (operation.operationType === "fueling") return "sectionFuelResult neutral";

  const fuelUsed = section.fuelAtStart - section.fuelAtEnd;
  if (fuelUsed < 0) return "sectionFuelResult bad";
  if (fuelUsed === 0 || normFuelPerHour === null) return "sectionFuelResult neutral";

  const minutes = durationMinutes(operation.operationStart, operation.operationEnd);
  const fuelPerHour = (fuelUsed * 60) / minutes;

  return fuelPerHour > normFuelPerHour
    ? "sectionFuelResult bad"
    : "sectionFuelResult good";
}

function savedSectionFuelText(
  operation: ThuOperation,
  section: LocomotiveSection
): string {
  if (operation.operationType === "fueling") {
    return section.fuelAdded === null
      ? uiText.common.emptyValue
      : `+${formatNumber(section.fuelAdded)} кг`;
  }

  const fuelUsed = section.fuelAtStart - section.fuelAtEnd;
  const minutes = durationMinutes(operation.operationStart, operation.operationEnd);
  const fuelPerHour = minutes > 0 ? (fuelUsed * 60) / minutes : 0;

  return `${formatNumber(fuelUsed)} кг · ${formatNumber(fuelPerHour)} кг/ч`;
}

function getSelectedStation(form: ThuForm): string {
  return form.stationMode === "new" ? form.newStation.trim() : form.station.trim();
}

export function ThuLibraryScreen() {
  const [operations, setOperations] = useState<ThuOperation[]>([]);
  const [form, setForm] = useState<ThuForm | null>(null);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [settings, setSettings] = useState(() => getSettings());
  const [stations, setStations] = useState(() => getThuStations());

  async function loadOperations() {
    try {
      const stored = await getDocuments("thuOperations");
      setOperations(stored);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOperations();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    return subscribeSettingsChange(() => setSettings(getSettings()));
  }, []);

  useEffect(() => {
    return subscribeThuStationsChange(() => setStations(getThuStations()));
  }, []);

  const groups = useMemo(() => groupOperations(operations), [operations]);
  const formCalculation = form ? formTotalCalculation(form) : null;
  const useCalendarInput = settings.dateTimeInputMode === "calendar";
  const showDateToolbar = settings.dateTimeInputMode === "friendly";
  const datePlaceholder =
    settings.dateTimeInputMode === "asu" ? "010126" : "01.01.26";
  const timePlaceholder =
    settings.dateTimeInputMode === "asu" ? "0100" : "01:00";

  function updateOperation(
    localId: string,
    patch: Partial<ThuOperationForm>
  ) {
    if (!form) return;
    setForm({
      ...form,
      operations: form.operations.map((operation) =>
        operation.localId === localId ? { ...operation, ...patch } : operation
      ),
    });
  }

  function updateSection(
    operationLocalId: string,
    sectionIndex: number,
    patch: Partial<SectionForm>
  ) {
    if (!form) return;
    setForm({
      ...form,
      operations: form.operations.map((operation) =>
        operation.localId === operationLocalId
          ? {
              ...operation,
              sections: operation.sections.map((section, index) =>
                index === sectionIndex ? { ...section, ...patch } : section
              ),
            }
          : operation
      ),
    });
  }

  function validateSections(
    operation: ThuOperationForm
  ): { sections: LocomotiveSection[] | null; error: string } {
    const firstSection = operation.sections[0];
    let validationError = "";

    const sections = operation.sections.map((section, index) => {
      const series =
        section.series.trim() ||
        (index > 0 ? firstSection.series.trim() : "");
      const locomotiveNumber =
        section.locomotiveNumber.trim() ||
        (index > 0 ? firstSection.locomotiveNumber.trim() : "");
      const fuelAtStart = parseFuel(section.fuelAtStart);
      const enteredFuelAtEnd = parseFuel(section.fuelAtEnd);
      const enteredFuelAdded = parseFuel(section.fuelAdded);
      const fuelAtEnd =
        operation.operationType === "fueling" &&
        enteredFuelAtEnd === null &&
        fuelAtStart !== null &&
        enteredFuelAdded !== null
          ? fuelAtStart + enteredFuelAdded
          : enteredFuelAtEnd;
      const fuelAdded =
        operation.operationType === "fueling" &&
        enteredFuelAdded === null &&
        fuelAtStart !== null &&
        enteredFuelAtEnd !== null
          ? enteredFuelAtEnd - fuelAtStart
          : operation.operationType === "fueling"
            ? enteredFuelAdded
            : null;

      if (
        !series ||
        !locomotiveNumber ||
        !section.sectionNumber.trim() ||
        fuelAtStart === null ||
        fuelAtEnd === null ||
        (operation.operationType === "fueling" &&
          (fuelAdded === null || fuelAdded < 0))
      ) {
        validationError = uiText.thuLibrary.requiredFields;
        return null;
      }

      if (operation.operationType !== "fueling" && fuelAtEnd > fuelAtStart) {
        validationError = uiText.thuLibrary.fuelDecrease;
        return null;
      }

      if (
        operation.operationType === "fueling" &&
        fuelAdded !== null &&
        Math.abs(fuelAtEnd - fuelAtStart - fuelAdded) > 0.001
      ) {
        validationError = uiText.thuLibrary.fuelingMismatch;
        return null;
      }

      return {
        id: section.id,
        series,
        locomotiveNumber,
        sectionNumber: section.sectionNumber.trim(),
        fuelAtStart,
        fuelAtEnd,
        fuelAdded,
      };
    });

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

    if (
      !form.documentNumber.trim() ||
      !form.shiftDate ||
      !form.shiftStart ||
      !form.shiftEnd ||
      form.operations.length === 0
    ) {
      setError(uiText.thuLibrary.requiredFields);
      return;
    }

    const shiftDate = normalizeDateInput(form.shiftDate);
    const shiftStart = normalizeTimeInput(form.shiftStart);
    const shiftEnd = normalizeTimeInput(form.shiftEnd);

    if (!shiftDate || !shiftStart || !shiftEnd) {
      setError(uiText.thuLibrary.invalidPeriod);
      return;
    }

    const shiftStartValue = `${shiftDate}T${shiftStart}`;
    const shiftEndValue = resolveEndDateTime(shiftStartValue, shiftEnd);

    if (!shiftEndValue || durationMinutes(shiftStartValue, shiftEndValue) <= 0) {
      setError(uiText.thuLibrary.invalidPeriod);
      return;
    }

    if (durationMinutes(shiftStartValue, shiftEndValue) > 12 * 60) {
      setError(uiText.thuLibrary.shiftTooLong);
      return;
    }

    const groupId = form.documentGroupId ?? createId();
    const station = getSelectedStation(form);
    const now = new Date().toISOString();
    const nextOperations: ThuOperation[] = [];

    for (const operationForm of form.operations) {
      const operationStart = normalizeTimeInput(operationForm.operationStart);
      const operationEnd = normalizeTimeInput(operationForm.operationEnd);

      if (!operationStart || !operationEnd) {
        setError(uiText.thuLibrary.requiredFields);
        return;
      }

      const operationStartValue = resolveTimeInsidePeriod(
        shiftStartValue,
        operationStart
      );
      const operationEndValue = operationStartValue
        ? resolveTimeInsidePeriod(
            shiftStartValue,
            operationEnd,
            operationStartValue
          )
        : null;

      if (
        !operationStartValue ||
        !operationEndValue ||
        durationMinutes(operationStartValue, operationEndValue) <= 0 ||
        new Date(operationStartValue).getTime() <
          new Date(shiftStartValue).getTime() ||
        new Date(operationEndValue).getTime() > new Date(shiftEndValue).getTime()
      ) {
        setError(uiText.thuLibrary.invalidPeriod);
        return;
      }

      const sectionValidation = validateSections(operationForm);
      if (!sectionValidation.sections) {
        setError(sectionValidation.error || uiText.thuLibrary.requiredFields);
        return;
      }

      nextOperations.push({
        id: operationForm.id ?? createId(),
        documentGroupId: groupId,
        documentNumber: form.documentNumber.trim(),
        driverName: form.driverName.trim() || undefined,
        station: station || undefined,
        shiftStart: shiftStartValue,
        shiftEnd: shiftEndValue,
        operationType: operationForm.operationType,
        operationStart: operationStartValue,
        operationEnd: operationEndValue,
        sections: sectionValidation.sections,
        createdAt: operationForm.createdAt ?? now,
        updatedAt: now,
      });
    }

    try {
      const currentIds = new Set(nextOperations.map((operation) => operation.id));
      const previousGroupItems = operations.filter(
        (operation) => (operation.documentGroupId ?? operation.id) === groupId
      );

      await Promise.all(
        nextOperations.map((operation) =>
          saveDocument("thuOperations", operation)
        )
      );
      await Promise.all(
        previousGroupItems
          .filter((operation) => !currentIds.has(operation.id))
          .map((operation) => deleteDocument("thuOperations", operation.id))
      );

      if (station) saveThuStation(station);
      setForm(null);
      await loadOperations();
    } catch {
      setStorageError(true);
    }
  }

  async function handleDeleteGroup(group: ThuGroup) {
    try {
      await Promise.all(
        group.operations.map((operation) =>
          deleteDocument("thuOperations", operation.id)
        )
      );
      if (form?.documentGroupId === group.id) setForm(null);
      await loadOperations();
    } catch {
      setStorageError(true);
    }
  }

  function applyShiftTimeToOperation(localId: string) {
    if (!form) return;
    updateOperation(localId, {
      operationStart: normalizeTimeInput(form.shiftStart) ?? form.shiftStart,
      operationEnd: normalizeTimeInput(form.shiftEnd) ?? form.shiftEnd,
    });
  }

  return (
    <section className="screen">
      <div className="card">
        <div className="libraryHeader">
          <div className="sectionTitle">
            <h2>{uiText.thuLibrary.title}</h2>
            <p>{uiText.thuLibrary.description}</p>
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
              {uiText.thuLibrary.add}
            </button>
          )}
        </div>

        {storageError && (
          <div className="errorBox">{uiText.thuLibrary.storageError}</div>
        )}

        {form && (
          <div className="documentForm">
            <div className="documentFormHeader">
              <h3>
                {form.documentGroupId
                  ? uiText.thuLibrary.edit
                  : uiText.thuLibrary.add}
              </h3>
              <button
                className="iconButton"
                type="button"
                aria-label={uiText.thuLibrary.cancel}
                onClick={() => setForm(null)}
              >
                <X size={19} />
              </button>
            </div>

            {(() => {
              const stationOptions = [
                ...new Set(
                  [form.station, ...stations].filter(
                    (station): station is string => Boolean(station)
                  )
                ),
              ];

              return (
            <div className="thuHeaderCard">
              <label className="field">
                <span>{uiText.thuLibrary.documentNumber}</span>
                <input
                  value={form.documentNumber}
                  onChange={(event) =>
                    setForm({ ...form, documentNumber: event.target.value })
                  }
                  inputMode="numeric"
                />
              </label>

              <div className="twoColumnGrid">
                <label className="field">
                  <span>Фамилия</span>
                  <input
                    value={form.driverName}
                    onChange={(event) =>
                      setForm({ ...form, driverName: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Станция</span>
                  <select
                    className="selectInput"
                    value={
                      form.stationMode === "new"
                        ? "__new"
                        : form.stationMode === "none"
                          ? "__none"
                          : form.station
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      setForm({
                        ...form,
                        station: value === "__new" || value === "__none" ? "" : value,
                        stationMode:
                          value === "__new"
                            ? "new"
                            : value === "__none"
                              ? "none"
                              : "saved",
                      });
                    }}
                  >
                    <option value="__none">Не указана</option>
                    {stationOptions.map((station) => (
                      <option value={station} key={station}>
                        {station}
                      </option>
                    ))}
                    <option value="__new">Добавить станцию</option>
                  </select>
                </label>
              </div>

              {form.stationMode === "new" && (
                <label className="field">
                  <span>Новая станция</span>
                  <input
                    value={form.newStation}
                    onChange={(event) =>
                      setForm({ ...form, newStation: event.target.value })
                    }
                  />
                </label>
              )}

              <div className="threeColumnGrid">
                <label className="field">
                  <span>Дата</span>
                  <input
                    type={useCalendarInput ? "date" : "text"}
                    value={
                      useCalendarInput
                        ? calendarDateValue(form.shiftDate)
                        : form.shiftDate
                    }
                    inputMode={useCalendarInput ? undefined : "numeric"}
                    placeholder={datePlaceholder}
                    onChange={(event) =>
                      setForm({ ...form, shiftDate: event.target.value })
                    }
                    onBlur={() =>
                      setForm({ ...form, shiftDate: displayDateInput(form.shiftDate) })
                    }
                  />
                  <DateInputToolbar
                    hidden={!showDateToolbar || useCalendarInput}
                    onInsert={(value) =>
                      setForm({ ...form, shiftDate: `${form.shiftDate}${value}` })
                    }
                  />
                </label>
                <label className="field">
                  <span>{uiText.thuLibrary.shiftStart}</span>
                  <input
                    type={useCalendarInput ? "time" : "text"}
                    value={
                      useCalendarInput
                        ? calendarTimeValue(form.shiftStart)
                        : form.shiftStart
                    }
                    inputMode={useCalendarInput ? undefined : "numeric"}
                    placeholder={timePlaceholder}
                    onChange={(event) =>
                      setForm({ ...form, shiftStart: event.target.value })
                    }
                    onBlur={() =>
                      setForm({ ...form, shiftStart: displayTimeInput(form.shiftStart) })
                    }
                  />
                  <DateInputToolbar
                    hidden={!showDateToolbar || useCalendarInput}
                    onInsert={(value) =>
                      setForm({ ...form, shiftStart: `${form.shiftStart}${value}` })
                    }
                  />
                </label>
                <label className="field">
                  <span>{uiText.thuLibrary.shiftEnd}</span>
                  <input
                    type={useCalendarInput ? "time" : "text"}
                    value={
                      useCalendarInput
                        ? calendarTimeValue(form.shiftEnd)
                        : form.shiftEnd
                    }
                    inputMode={useCalendarInput ? undefined : "numeric"}
                    placeholder={timePlaceholder}
                    onChange={(event) =>
                      setForm({ ...form, shiftEnd: event.target.value })
                    }
                    onBlur={() =>
                      setForm({ ...form, shiftEnd: displayTimeInput(form.shiftEnd) })
                    }
                  />
                  <DateInputToolbar
                    hidden={!showDateToolbar || useCalendarInput}
                    onInsert={(value) =>
                      setForm({ ...form, shiftEnd: `${form.shiftEnd}${value}` })
                    }
                  />
                </label>
              </div>
            </div>
              );
            })()}

            <div className="thuOperations">
              {form.operations.map((operation, operationIndex) => {
                const previewShiftDate = normalizeDateInput(form.shiftDate);
                const previewShiftStart = normalizeTimeInput(form.shiftStart);
                const operationCalculation =
                  previewShiftDate && previewShiftStart
                  ? formOperationCalculation(
                      operation,
                      previewShiftDate,
                      previewShiftStart
                    )
                  : null;

                return (
                  <div className="thuOperationCard" key={operation.localId}>
                    <div className="sectionFormHeader">
                      <b>Операция {operationIndex + 1}</b>
                      {form.operations.length > 1 && (
                        <button
                          className="iconDangerButton"
                          type="button"
                          aria-label="Удалить операцию"
                          onClick={() =>
                            setForm({
                              ...form,
                              operations: form.operations.filter(
                                (item) => item.localId !== operation.localId
                              ),
                            })
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </div>

                    <div className="threeColumnGrid">
                      <label className="field">
                        <span>{uiText.thuLibrary.operationType}</span>
                        <select
                          className="selectInput"
                          value={operation.operationType}
                          onChange={(event) =>
                            updateOperation(operation.localId, {
                              operationType: event.target
                                .value as ThuOperationType,
                            })
                          }
                        >
                          {operationTypes.map((type) => (
                            <option value={type} key={type}>
                              {uiText.thuLibrary.operationTypes[type]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>{uiText.thuLibrary.operationStart}</span>
                        <input
                          type={useCalendarInput ? "time" : "text"}
                          value={
                            useCalendarInput
                              ? calendarTimeValue(operation.operationStart)
                              : operation.operationStart
                          }
                          inputMode={useCalendarInput ? undefined : "numeric"}
                          placeholder={timePlaceholder}
                          onChange={(event) =>
                            updateOperation(operation.localId, {
                              operationStart: event.target.value,
                            })
                          }
                          onBlur={() =>
                            updateOperation(operation.localId, {
                              operationStart: displayTimeInput(
                                operation.operationStart
                              ),
                            })
                          }
                        />
                        <DateInputToolbar
                          hidden={!showDateToolbar || useCalendarInput}
                          onInsert={(value) =>
                            updateOperation(operation.localId, {
                              operationStart: `${operation.operationStart}${value}`,
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>{uiText.thuLibrary.operationEnd}</span>
                        <input
                          type={useCalendarInput ? "time" : "text"}
                          value={
                            useCalendarInput
                              ? calendarTimeValue(operation.operationEnd)
                              : operation.operationEnd
                          }
                          inputMode={useCalendarInput ? undefined : "numeric"}
                          placeholder={timePlaceholder}
                          onChange={(event) =>
                            updateOperation(operation.localId, {
                              operationEnd: event.target.value,
                            })
                          }
                          onBlur={() =>
                            updateOperation(operation.localId, {
                              operationEnd: displayTimeInput(operation.operationEnd),
                            })
                          }
                        />
                        <DateInputToolbar
                          hidden={!showDateToolbar || useCalendarInput}
                          onInsert={(value) =>
                            updateOperation(operation.localId, {
                              operationEnd: `${operation.operationEnd}${value}`,
                            })
                          }
                        />
                      </label>
                    </div>

                    <button
                      className="secondaryButton compact thuInlineAction"
                      type="button"
                      onClick={() => applyShiftTimeToOperation(operation.localId)}
                    >
                      Время как смена
                    </button>

                    <div className="thuSectionsTableWrap">
                      <table className="thuSectionsTable">
                        <thead>
                          <tr>
                            <th>Серия</th>
                            <th>№</th>
                            <th>Секц.</th>
                            <th>Приём</th>
                            <th>Сдача</th>
                            {operation.operationType === "fueling" && (
                              <th>Набрано</th>
                            )}
                            {operation.operationType !== "fueling" && (
                              <th>Расход</th>
                            )}
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {operation.sections.map((section, sectionIndex) => {
                            const delta = sectionFuelDelta(section);
                            const firstSection = operation.sections[0];
                            const inherited =
                              sectionIndex > 0 &&
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
                                      updateSection(operation.localId, sectionIndex, {
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
                                      updateSection(operation.localId, sectionIndex, {
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
                                      updateSection(operation.localId, sectionIndex, {
                                        sectionNumber: event.target.value,
                                      })
                                    }
                                  />
                                </td>
                                <td data-label="Приём">
                                  <input
                                    value={section.fuelAtStart}
                                    inputMode="decimal"
                                    onChange={(event) => {
                                      const nextSection = {
                                        ...section,
                                        fuelAtStart: event.target.value,
                                      };
                                      const nextFuelAtEnd =
                                        operation.operationType === "fueling" &&
                                        section.fuelAdded
                                          ? calculateFuelingEnd(nextSection)
                                          : null;
                                      const nextFuelAdded =
                                        operation.operationType === "fueling" &&
                                        !section.fuelAdded &&
                                        section.fuelAtEnd
                                          ? calculateFuelingAdded(nextSection)
                                          : null;

                                      updateSection(operation.localId, sectionIndex, {
                                        fuelAtStart: event.target.value,
                                        fuelAtEnd:
                                          nextFuelAtEnd ?? section.fuelAtEnd,
                                        fuelAdded:
                                          nextFuelAdded ?? section.fuelAdded,
                                      });
                                    }}
                                  />
                                </td>
                                <td data-label="Сдача">
                                  <input
                                    value={section.fuelAtEnd}
                                    inputMode="decimal"
                                    onChange={(event) => {
                                      const nextSection = {
                                        ...section,
                                        fuelAtEnd: event.target.value,
                                      };
                                      updateSection(operation.localId, sectionIndex, {
                                        fuelAtEnd: event.target.value,
                                        fuelAdded:
                                          operation.operationType === "fueling"
                                            ? (calculateFuelingAdded(
                                                nextSection
                                              ) ?? section.fuelAdded)
                                            : section.fuelAdded,
                                      });
                                    }}
                                  />
                                </td>
                                {operation.operationType === "fueling" && (
                                  <td data-label="Набрано">
                                    <input
                                      value={section.fuelAdded}
                                      inputMode="decimal"
                                      onChange={(event) => {
                                        const nextSection = {
                                          ...section,
                                          fuelAdded: event.target.value,
                                        };
                                        updateSection(
                                          operation.localId,
                                          sectionIndex,
                                          {
                                            fuelAdded: event.target.value,
                                            fuelAtEnd:
                                              calculateFuelingEnd(nextSection) ??
                                              section.fuelAtEnd,
                                          }
                                        );
                                      }}
                                    />
                                  </td>
                                )}
                                {operation.operationType !== "fueling" && (
                                  <td data-label="Расход">
                                    <span
                                      className={sectionFuelClass(
                                        section,
                                        operationCalculation,
                                        settings.normFuelPerHour
                                      )}
                                    >
                                      {delta === null
                                        ? uiText.common.emptyValue
                                        : formatNumber(delta)}
                                    </span>
                                  </td>
                                )}
                                <td className="thuSectionActions">
                                  {operation.sections.length > 1 && (
                                    <button
                                      className="iconDangerButton mini"
                                      type="button"
                                      aria-label={uiText.thuLibrary.removeSection}
                                      onClick={() =>
                                        updateOperation(operation.localId, {
                                          sections: operation.sections.filter(
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

                    {operation.sections.length < 3 && (
                      <button
                        className="secondaryButton compact thuInlineAction"
                        type="button"
                        onClick={() =>
                          updateOperation(operation.localId, {
                            sections: [
                              ...operation.sections,
                              createSection(operation.sections.length),
                            ],
                          })
                        }
                      >
                        <Plus size={18} />
                        {uiText.thuLibrary.addSection}
                      </button>
                    )}

                    {operationCalculation && (
                      <div className="miniResult">
                        {formatTime(operationCalculation.minutes)} ·{" "}
                        {formatNumber(operationCalculation.fuelUsed)} кг ·{" "}
                        {formatNumber(operationCalculation.fuelPerHour)} кг/ч
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              className="secondaryButton"
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  operations: [...form.operations, createOperationForm()],
                })
              }
            >
              <Plus size={18} />
              Добавить операцию
            </button>

            {formCalculation && (
              <div className="hotIdleResult">
                <b>Итог по ТХУ-3</b>
                <span>{uiText.thuLibrary.hotIdle}: {formatTime(formCalculation.minutes)}</span>
                <span>Общий расход: {formatNumber(formCalculation.fuelUsed)} кг</span>
                <span>Расход в час: {formatNumber(formCalculation.fuelPerHour)} кг/ч</span>
                {settings.normFuelPerHour !== null && (
                  <span>
                    Сдача по нормативу:{" "}
                    {formatNumber(
                      form.operations.reduce(
                        (sum, operation) =>
                          sum +
                          operation.sections.reduce((sectionSum, section) => {
                            const start = parseFuel(section.fuelAtStart);
                            return sectionSum + (start ?? 0);
                          }, 0),
                        0
                      ) -
                        (settings.normFuelPerHour * formCalculation.minutes) /
                          60
                    )}{" "}
                    кг
                  </span>
                )}
                <NormComparison
                  result={formCalculation}
                  normFuelPerHour={settings.normFuelPerHour}
                />
              </div>
            )}

            {error && <div className="errorBox">{error}</div>}

            <div className="documentFormActions">
              <button
                className="primaryButton"
                type="button"
                onClick={() => void handleSave()}
              >
                {uiText.thuLibrary.save}
              </button>
              <button
                className="secondaryButton compact"
                type="button"
                onClick={() => setForm(null)}
              >
                {uiText.thuLibrary.cancel}
              </button>
            </div>
          </div>
        )}

        {!form && groups.length === 0 && !storageError && (
          <p className="emptyHistory">{uiText.thuLibrary.empty}</p>
        )}

        {!form && groups.length > 0 && (
          <div className="documentList">
            {groups.map((group) => {
              const first = group.operations[0];
              const calculation = getGroupHotIdleCalculation(group.operations);

              return (
                <article className="documentCard" key={group.id}>
                  <div className="documentCardHeader">
                    <div>
                      <b>ТХУ-3 № {first.documentNumber}</b>
                      <p>
                        {[first.driverName, first.station]
                          .filter(Boolean)
                          .join(" · ") || "Без фамилии и станции"}
                      </p>
                    </div>
                    <div className="documentCardActions">
                      <button
                        className="iconButton"
                        type="button"
                        aria-label={uiText.thuLibrary.editAction}
                        onClick={() => {
                          setError("");
                          setForm(toForm(group));
                        }}
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        className="iconDangerButton"
                        type="button"
                        aria-label={uiText.thuLibrary.delete}
                        onClick={() => void handleDeleteGroup(group)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>

                  <p className="documentPeriod">
                    Смена: {formatOperationDate(first.shiftStart)} →{" "}
                    {formatOperationDate(first.shiftEnd)}
                  </p>

                  <div className="thuSavedTableWrap">
                    <table className="thuSavedTable">
                      <thead>
                        <tr>
                          <th>Операция</th>
                          <th>Время</th>
                          <th>Тепловоз</th>
                          <th>Секц.</th>
                          <th>Приём</th>
                          <th>Сдача</th>
                          <th>Итог</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.operations.flatMap((operation) =>
                          operation.sections.map((section) => (
                            <tr key={`${operation.id}-${section.id}`}>
                              <td data-label="Операция">
                                {
                                  uiText.thuLibrary.operationTypes[
                                    operation.operationType
                                  ]
                                }
                              </td>
                              <td data-label="Время">
                                {formatTime(
                                  durationMinutes(
                                    operation.operationStart,
                                    operation.operationEnd
                                  )
                                )}
                              </td>
                              <td data-label="Тепловоз">
                                {section.series}-{section.locomotiveNumber}
                              </td>
                              <td data-label="Секц.">
                                {section.sectionNumber}
                              </td>
                              <td data-label="Приём">
                                {formatNumber(section.fuelAtStart)}
                              </td>
                              <td data-label="Сдача">
                                {formatNumber(section.fuelAtEnd)}
                              </td>
                              <td data-label="Итог">
                                <span
                                  className={savedSectionFuelClass(
                                    operation,
                                    section,
                                    settings.normFuelPerHour
                                  )}
                                >
                                  {savedSectionFuelText(operation, section)}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="thuGroupOperations">
                    {group.operations.map((operation) => (
                      <div className="thuGroupOperation" key={operation.id}>
                        <b>
                          {uiText.thuLibrary.operationTypes[
                            operation.operationType
                          ]}
                        </b>
                        <small>
                          {formatOperationDate(operation.operationStart)} →{" "}
                          {formatOperationDate(operation.operationEnd)} ·{" "}
                          {uiText.thuLibrary.sectionsCount(
                            operation.sections.length
                          )}
                        </small>
                      </div>
                    ))}
                  </div>

                  <div className="documentSections">
                    {first.sections.map((section) => (
                      <span key={section.id}>
                        {section.series}-{section.locomotiveNumber}/
                        {section.sectionNumber}
                      </span>
                    ))}
                  </div>

                  {calculation && (
                    <div className="hotIdleResult compactResult">
                      <b>{uiText.thuLibrary.hotIdle}</b>
                      <span>{formatTime(calculation.minutes)}</span>
                      <span>{formatNumber(calculation.fuelUsed)} кг</span>
                      <span>{formatNumber(calculation.fuelPerHour)} кг/ч</span>
                      <NormComparison
                        result={calculation}
                        normFuelPerHour={settings.normFuelPerHour}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
