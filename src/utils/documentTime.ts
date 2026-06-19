import {
  addDays,
  dateWithTime,
  parseDateTime,
} from "./dateTime.ts";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatLocalDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatTimeOnly(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function resolveEndDateTime(
  startValue: string,
  endValue: string
): string | null {
  const startDate = new Date(startValue);
  const parsedEnd = parseDateTime(endValue);

  if (Number.isNaN(startDate.getTime()) || !parsedEnd) return null;

  if (parsedEnd.type === "datetime") {
    return parsedEnd.date.getTime() > startDate.getTime()
      ? formatLocalDateTime(parsedEnd.date)
      : null;
  }

  let endDate = dateWithTime(startDate, parsedEnd.minutes);
  if (endDate.getTime() <= startDate.getTime()) {
    endDate = addDays(endDate, 1);
  }

  return formatLocalDateTime(endDate);
}

export function resolveTimeInsidePeriod(
  periodStartValue: string,
  timeValue: string,
  notBeforeValue?: string
): string | null {
  const periodStart = new Date(periodStartValue);
  const parsedTime = parseDateTime(timeValue);

  if (
    Number.isNaN(periodStart.getTime()) ||
    !parsedTime ||
    parsedTime.type !== "time"
  ) {
    return null;
  }

  const notBefore = notBeforeValue
    ? new Date(notBeforeValue)
    : periodStart;
  let result = dateWithTime(periodStart, parsedTime.minutes);

  if (result.getTime() < notBefore.getTime()) {
    result = addDays(result, 1);
  }

  return formatLocalDateTime(result);
}

export function durationMinutes(startValue: string, endValue: string): number {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return Math.round((end - start) / 60000);
}
