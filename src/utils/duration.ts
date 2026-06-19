export function parseDurationToMinutes(value: string): number | null {
  const raw = value.trim().toLowerCase();

  if (!raw) return null;

  const colonMatch = raw.match(/^(\d{1,6})[:.](\d{1,2})$/);
  if (colonMatch) {
    const hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2]);

    if (minutes >= 0 && minutes <= 59) {
      const total = hours * 60 + minutes;
      return total > 0 ? total : null;
    }

    return null;
  }

  const compactTimeMatch = raw.match(/^(\d{1,6})(\d{2})$/);
  if (compactTimeMatch) {
    const hours = Number(compactTimeMatch[1]);
    const minutes = Number(compactTimeMatch[2]);

    if (minutes >= 0 && minutes <= 59) {
      const total = hours * 60 + minutes;
      return total > 0 ? total : null;
    }

    return null;
  }

  const textMatch = raw.match(
    /^(\d{1,6})\s*ч(?:ас(?:а|ов)?)?\s*(\d{1,2})?\s*м?$/
  );
  if (textMatch) {
    const hours = Number(textMatch[1]);
    const minutes = textMatch[2] ? Number(textMatch[2]) : 0;

    if (minutes >= 0 && minutes <= 59) {
      const total = hours * 60 + minutes;
      return total > 0 ? total : null;
    }
  }

  return null;
}

export function formatDurationInput(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(restMinutes).padStart(2, "0")}`;
}
