export type ParsedDateTime =
  | {
      type: "datetime";
      date: Date;
    }
  | {
      type: "time";
      minutes: number;
    };

function normalizeYear(year: string): number {
  const num = Number(year);

  return year.length === 2 ? 2000 + num : num;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateTime(date: Date): string {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function formatOnlyTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  return `${pad(hours)}:${pad(restMinutes)}`;
}

export function dateWithTime(baseDate: Date, minutes: number): Date {
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hours,
    restMinutes
  );
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function createDate(
  day: number,
  month: number,
  year: number,
  hours: number,
  minutes: number
): Date | null {
  const date = new Date(year, month - 1, day, hours, minutes);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return date;
}

export function parseDateTime(value: string): ParsedDateTime | null {
  const raw = value.trim();

  if (!raw) return null;

  const onlyTimeMatch = raw.match(/^(\d{1,2})[:.](\d{2})$/);
  if (onlyTimeMatch) {
    const hours = Number(onlyTimeMatch[1]);
    const minutes = Number(onlyTimeMatch[2]);

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return {
        type: "time",
        minutes: hours * 60 + minutes,
      };
    }

    return null;
  }

  const compactTimeMatch = raw.match(/^(\d{2})(\d{2})$/);
  if (compactTimeMatch) {
    const hours = Number(compactTimeMatch[1]);
    const minutes = Number(compactTimeMatch[2]);

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return {
        type: "time",
        minutes: hours * 60 + minutes,
      };
    }

    return null;
  }

  const dottedDateTimeMatch = raw.match(
    /^(\d{2})[.](\d{2})[.](\d{2}|\d{4})\s+(\d{1,2})[:.]?(\d{2})$/
  );

  if (dottedDateTimeMatch) {
    const date = createDate(
      Number(dottedDateTimeMatch[1]),
      Number(dottedDateTimeMatch[2]),
      normalizeYear(dottedDateTimeMatch[3]),
      Number(dottedDateTimeMatch[4]),
      Number(dottedDateTimeMatch[5])
    );

    return date ? { type: "datetime", date } : null;
  }

  const compactDateTimeMatch = raw.match(
    /^(\d{2})(\d{2})(\d{2}|\d{4})\s+(\d{1,2})[:.]?(\d{2})$/
  );

  if (compactDateTimeMatch) {
    const date = createDate(
      Number(compactDateTimeMatch[1]),
      Number(compactDateTimeMatch[2]),
      normalizeYear(compactDateTimeMatch[3]),
      Number(compactDateTimeMatch[4]),
      Number(compactDateTimeMatch[5])
    );

    return date ? { type: "datetime", date } : null;
  }

  const digitsOnlyDateTimeMatch = raw.match(
    /^(\d{2})(\d{2})(\d{2}|\d{4})(\d{2})(\d{2})$/
  );

  if (digitsOnlyDateTimeMatch) {
    const date = createDate(
      Number(digitsOnlyDateTimeMatch[1]),
      Number(digitsOnlyDateTimeMatch[2]),
      normalizeYear(digitsOnlyDateTimeMatch[3]),
      Number(digitsOnlyDateTimeMatch[4]),
      Number(digitsOnlyDateTimeMatch[5])
    );

    return date ? { type: "datetime", date } : null;
  }

  return null;
}

export function getHeatingMinutes(
  start: ParsedDateTime,
  end: ParsedDateTime,
  nextDay: boolean
): number | null {
  if (start.type === "datetime" && end.type === "datetime") {
    let endDate = end.date;

    if (endDate.getTime() <= start.date.getTime() && nextDay) {
      endDate = addDays(endDate, 1);
    }

    const diffMinutes = Math.round(
      (endDate.getTime() - start.date.getTime()) / 60000
    );

    return diffMinutes > 0 ? diffMinutes : null;
  }

  if (start.type === "datetime" && end.type === "time") {
    let endDate = dateWithTime(start.date, end.minutes);

    if (endDate.getTime() <= start.date.getTime() && nextDay) {
      endDate = addDays(endDate, 1);
    }

    const diffMinutes = Math.round(
      (endDate.getTime() - start.date.getTime()) / 60000
    );

    return diffMinutes > 0 ? diffMinutes : null;
  }

  if (start.type === "time" && end.type === "time") {
    let minutes = end.minutes - start.minutes;

    if (minutes <= 0 && nextDay) {
      minutes += 24 * 60;
    }

    return minutes > 0 ? minutes : null;
  }

  return null;
}

export function formatInputValue(
  parsed: ParsedDateTime | null,
  baseDate?: Date
): string | null {
  if (!parsed) return null;

  if (parsed.type === "datetime") {
    return formatDateTime(parsed.date);
  }

  if (baseDate) {
    return formatDateTime(dateWithTime(baseDate, parsed.minutes));
  }

  return formatOnlyTime(parsed.minutes);
}
