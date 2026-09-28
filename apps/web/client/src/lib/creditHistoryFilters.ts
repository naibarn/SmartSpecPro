export interface CreditHistoryDateRange {
  startDate: string;
  endDate: string;
}

export function formatCreditHistoryDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function subtractOneCalendarMonth(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), 1);
  result.setMonth(result.getMonth() - 1);
  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0
  ).getDate();
  result.setDate(Math.min(date.getDate(), lastDayOfTargetMonth));
  return result;
}

export function getDefaultCreditHistoryDateRange(
  now = new Date()
): CreditHistoryDateRange {
  return {
    startDate: formatCreditHistoryDateInputValue(subtractOneCalendarMonth(now)),
    endDate: formatCreditHistoryDateInputValue(now),
  };
}

export function parseCreditHistoryStartDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function parseCreditHistoryEndDateExclusive(value: string): Date {
  const date = parseCreditHistoryStartDate(value);
  date.setDate(date.getDate() + 1);
  return date;
}

export function isCreditHistoryDateRangeValid(
  startDate: Date,
  endDateExclusive: Date
): boolean {
  return (
    Number.isFinite(startDate.getTime()) &&
    Number.isFinite(endDateExclusive.getTime()) &&
    endDateExclusive > startDate
  );
}
