import i18next from "i18next";

function getLocale(lng?: string): string {
  return lng ?? i18next.language ?? "en";
}

export function formatDate(
  date: Date | number,
  options?: Intl.DateTimeFormatOptions,
  lng?: string,
): string {
  try {
    return new Intl.DateTimeFormat(getLocale(lng), options).format(date);
  } catch {
    return String(date);
  }
}

export function formatNumber(
  num: number,
  options?: Intl.NumberFormatOptions,
  lng?: string,
): string {
  try {
    return new Intl.NumberFormat(getLocale(lng), options).format(num);
  } catch {
    return String(num);
  }
}

export function formatCurrency(
  amount: number,
  currency: string,
  lng?: string,
): string {
  try {
    return new Intl.NumberFormat(getLocale(lng), {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return String(amount);
  }
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeTime(
  date: Date | number,
  lng?: string,
): string {
  try {
    const timestamp = typeof date === "number" ? date : date.getTime();
    const diff = timestamp - Date.now();
    const absDiff = Math.abs(diff);

    const rtf = new Intl.RelativeTimeFormat(getLocale(lng), {
      numeric: "auto",
    });

    if (absDiff < MINUTE) return rtf.format(Math.round(diff / SECOND), "second");
    if (absDiff < HOUR) return rtf.format(Math.round(diff / MINUTE), "minute");
    if (absDiff < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
    if (absDiff < MONTH) return rtf.format(Math.round(diff / DAY), "day");
    if (absDiff < YEAR) return rtf.format(Math.round(diff / MONTH), "month");
    return rtf.format(Math.round(diff / YEAR), "year");
  } catch {
    return String(date);
  }
}
