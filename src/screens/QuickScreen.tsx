import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CalculationResultCard } from "../components/CalculationResultCard";
import { NormComparison } from "../components/NormComparison";
import { SaveResultPanel } from "../components/SaveResultPanel";
import { uiText } from "../content";
import type { CalculationSource, HistoryEntry } from "../types";
import {
  calculateByFuelDifference,
  calculateManual,
  parseFuel,
} from "../utils/calculations";
import {
  addDays,
  dateWithTime,
  formatDateTime,
  formatInputValue,
  getHeatingMinutes,
  parseDateTime,
} from "../utils/dateTime";
import {
  formatDurationInput,
  parseDurationToMinutes,
} from "../utils/duration";
import { formatNumber } from "../utils/format";
import { getSettings, subscribeSettingsChange } from "../utils/storage";

type CalculationMode = "duration" | "interval";

type QuickScreenProps = {
  initialEntry: HistoryEntry | null;
};

export function QuickScreen({ initialEntry }: QuickScreenProps) {
  const initialMode: CalculationMode =
    initialEntry?.source.type === "byTime" ? "interval" : "duration";
  const initialQuickSource =
    initialEntry?.source.type === "quick" ? initialEntry.source : null;
  const initialIntervalSource =
    initialEntry?.source.type === "byTime" ? initialEntry.source : null;

  const [mode, setMode] = useState<CalculationMode>(initialMode);
  const [duration, setDuration] = useState(
    initialQuickSource?.duration ?? ""
  );
  const [fuelUsed, setFuelUsed] = useState(
    initialQuickSource ? formatNumber(initialQuickSource.fuelUsed) : ""
  );
  const [startTime, setStartTime] = useState(
    initialIntervalSource?.startTime ?? ""
  );
  const [endTime, setEndTime] = useState(
    initialIntervalSource?.endTime ?? ""
  );
  const [fuelStart, setFuelStart] = useState(
    initialIntervalSource
      ? formatNumber(initialIntervalSource.fuelStart)
      : ""
  );
  const [fuelEnd, setFuelEnd] = useState(
    initialIntervalSource ? formatNumber(initialIntervalSource.fuelEnd) : ""
  );
  const [nextDay, setNextDay] = useState(false);
  const [settings, setSettings] = useState(() => getSettings());

  useEffect(() => {
    return subscribeSettingsChange(() => {
      setSettings(getSettings());
    });
  }, []);

  const parsedStart = parseDateTime(startTime);
  const parsedEnd = parseDateTime(endTime);
  const durationParsed = parseDurationToMinutes(duration);
  const fuelUsedParsed = parseFuel(fuelUsed);
  const fuelStartParsed = parseFuel(fuelStart);
  const fuelEndParsed = parseFuel(fuelEnd);

  const calculation = useMemo(() => {
    if (mode === "duration") {
      if (durationParsed === null || fuelUsedParsed === null) return null;
      return calculateManual(durationParsed, fuelUsedParsed);
    }

    if (
      parsedStart === null ||
      parsedEnd === null ||
      fuelStartParsed === null ||
      fuelEndParsed === null
    ) {
      return null;
    }

    const minutes = getHeatingMinutes(parsedStart, parsedEnd, nextDay);
    return minutes === null
      ? null
      : calculateByFuelDifference(
          minutes,
          fuelStartParsed,
          fuelEndParsed
        );
  }, [
    durationParsed,
    fuelEndParsed,
    fuelStartParsed,
    fuelUsedParsed,
    mode,
    nextDay,
    parsedEnd,
    parsedStart,
  ]);

  const needNextDayWarning = (() => {
    if (
      mode !== "interval" ||
      !parsedStart ||
      !parsedEnd ||
      nextDay
    ) {
      return false;
    }

    if (parsedStart.type === "time" && parsedEnd.type === "time") {
      return parsedEnd.minutes <= parsedStart.minutes;
    }
    if (parsedStart.type === "datetime" && parsedEnd.type === "time") {
      return (
        dateWithTime(parsedStart.date, parsedEnd.minutes).getTime() <=
        parsedStart.date.getTime()
      );
    }
    if (
      parsedStart.type === "datetime" &&
      parsedEnd.type === "datetime"
    ) {
      return parsedEnd.date.getTime() <= parsedStart.date.getTime();
    }
    return false;
  })();

  const durationError =
    mode === "duration" &&
    duration.trim() !== "" &&
    durationParsed === null;
  const fuelUsedError =
    mode === "duration" &&
    fuelUsed.trim() !== "" &&
    fuelUsedParsed === null;
  const fuelIntervalError =
    mode === "interval" &&
    fuelStartParsed !== null &&
    fuelEndParsed !== null &&
    fuelEndParsed > fuelStartParsed;
  const mixedDateError =
    mode === "interval" &&
    parsedStart !== null &&
    parsedEnd !== null &&
    parsedStart.type === "time" &&
    parsedEnd.type === "datetime";

  function handleDurationBlur() {
    if (durationParsed !== null) {
      setDuration(formatDurationInput(durationParsed));
    }
  }

  function handleStartBlur() {
    const formatted = formatInputValue(parseDateTime(startTime));
    if (formatted) setStartTime(formatted);
  }

  function handleEndBlur() {
    const start = parseDateTime(startTime);
    const formatted = formatInputValue(
      parseDateTime(endTime),
      start?.type === "datetime" ? start.date : undefined
    );
    if (formatted) setEndTime(formatted);
  }

  function confirmNextDay() {
    setNextDay(true);
    const start = parseDateTime(startTime);
    const end = parseDateTime(endTime);

    if (start?.type === "datetime" && end?.type === "time") {
      setEndTime(
        formatDateTime(addDays(dateWithTime(start.date, end.minutes), 1))
      );
    }
    if (
      start?.type === "datetime" &&
      end?.type === "datetime" &&
      end.date.getTime() <= start.date.getTime()
    ) {
      setEndTime(formatDateTime(addDays(end.date, 1)));
    }
  }

  function clearAll() {
    if (mode === "duration") {
      setDuration("");
      setFuelUsed("");
      return;
    }

    setStartTime("");
    setEndTime("");
    setFuelStart("");
    setFuelEnd("");
    setNextDay(false);
  }

  const source: CalculationSource | null = (() => {
    if (!calculation) return null;

    if (mode === "duration") {
      return {
        type: "quick",
        duration: formatDurationInput(calculation.minutes),
        fuelUsed: calculation.fuelUsed,
      };
    }

    if (fuelStartParsed === null || fuelEndParsed === null) return null;
    return {
      type: "byTime",
      startTime,
      endTime,
      fuelStart: fuelStartParsed,
      fuelEnd: fuelEndParsed,
    };
  })();

  return (
    <section className="screen">
      <div className="card">
        <div className="sectionTitle">
          <h2>{uiText.quick.title}</h2>
          <p>{uiText.quick.description}</p>
        </div>

        <div className="segmentedControl calculationMode">
          <button
            className={
              mode === "duration" ? "segmentButton active" : "segmentButton"
            }
            type="button"
            onClick={() => setMode("duration")}
          >
            {uiText.quick.durationMode}
          </button>
          <button
            className={
              mode === "interval" ? "segmentButton active" : "segmentButton"
            }
            type="button"
            onClick={() => setMode("interval")}
          >
            {uiText.quick.intervalMode}
          </button>
        </div>

        {mode === "duration" ? (
          <div className="grid">
            <label className="field">
              <span>{uiText.quick.duration}</span>
              <input
                value={duration}
                onBlur={handleDurationBlur}
                onChange={(event) => setDuration(event.target.value)}
                placeholder={uiText.quick.durationPlaceholder}
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span>{uiText.quick.fuelUsed}</span>
              <input
                value={fuelUsed}
                onChange={(event) => setFuelUsed(event.target.value)}
                placeholder={uiText.quick.fuelPlaceholder}
                inputMode="decimal"
              />
            </label>
          </div>
        ) : (
          <div className="grid">
            <label className="field">
              <span>{uiText.byTime.startTime}</span>
              <input
                value={startTime}
                onBlur={handleStartBlur}
                onChange={(event) => {
                  setStartTime(event.target.value);
                  setNextDay(false);
                }}
                placeholder={uiText.byTime.startTimePlaceholder}
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span>{uiText.byTime.endTime}</span>
              <input
                value={endTime}
                onBlur={handleEndBlur}
                onChange={(event) => {
                  setEndTime(event.target.value);
                  setNextDay(false);
                }}
                placeholder={uiText.byTime.endTimePlaceholder}
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span>{uiText.byTime.fuelStart}</span>
              <input
                value={fuelStart}
                onChange={(event) => setFuelStart(event.target.value)}
                placeholder={uiText.byTime.fuelPlaceholder}
                inputMode="decimal"
              />
            </label>
            <label className="field">
              <span>{uiText.byTime.fuelEnd}</span>
              <input
                value={fuelEnd}
                onChange={(event) => setFuelEnd(event.target.value)}
                placeholder={uiText.byTime.fuelEndPlaceholder}
                inputMode="decimal"
              />
            </label>
          </div>
        )}

        <button
          className="secondaryButton clearAllButton"
          type="button"
          onClick={clearAll}
        >
          <RotateCcw size={18} />
          {uiText.common.clearAll}
        </button>

        {durationError && (
          <div className="errorBox">{uiText.quick.durationError}</div>
        )}
        {fuelUsedError && (
          <div className="errorBox">{uiText.quick.fuelError}</div>
        )}
        {needNextDayWarning && (
          <div className="warningBox">
            <p>{uiText.byTime.nextDayQuestion}</p>
            <button type="button" onClick={confirmNextDay}>
              {uiText.byTime.nextDayConfirm}
            </button>
          </div>
        )}
        {mixedDateError && (
          <div className="errorBox">{uiText.byTime.mixedDateError}</div>
        )}
        {fuelIntervalError && (
          <div className="errorBox">{uiText.byTime.fuelError}</div>
        )}
      </div>

      <CalculationResultCard result={calculation}>
        {calculation && (
          <NormComparison
            result={calculation}
            normFuelPerHour={settings.normFuelPerHour}
            fuelAtStart={
              mode === "interval" ? fuelStartParsed : undefined
            }
          />
        )}
        <SaveResultPanel
          result={calculation}
          defaultTitle={uiText.quick.title}
          source={source}
        />
      </CalculationResultCard>
    </section>
  );
}
