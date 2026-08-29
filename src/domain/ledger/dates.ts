import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfYear,
  subDays,
} from 'date-fns';
import type { DatePreset, DateRange } from './types';
export const todayLocal = () => format(new Date(), 'yyyy-MM-dd');
export const isCalendarDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  isValid(parseISO(value)) &&
  format(parseISO(value), 'yyyy-MM-dd') === value;
export const daysBetweenInclusive = (start: string, end: string) =>
  differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
export const shiftRange = (range: DateRange, days: number): DateRange => ({
  start: format(addDays(parseISO(range.start), days), 'yyyy-MM-dd'),
  end: format(addDays(parseISO(range.end), days), 'yyyy-MM-dd'),
});
export function dateRangeForPreset(preset: DatePreset, now = new Date()): DateRange {
  const day = format(now, 'yyyy-MM-dd');
  if (preset === 'previous-month') {
    const start = startOfMonth(addMonths(now, -1));
    return { start: format(start, 'yyyy-MM-dd'), end: format(endOfMonth(start), 'yyyy-MM-dd') };
  }
  if (preset === 'last-7-days') return { start: format(subDays(now, 6), 'yyyy-MM-dd'), end: day };
  if (preset === 'last-30-days') return { start: format(subDays(now, 29), 'yyyy-MM-dd'), end: day };
  if (preset === 'this-year')
    return {
      start: format(startOfYear(now), 'yyyy-MM-dd'),
      end: format(endOfYear(now), 'yyyy-MM-dd'),
    };
  if (preset === 'all-time') return { start: '0000-01-01', end: '9999-12-31' };
  return {
    start: format(startOfMonth(now), 'yyyy-MM-dd'),
    end: format(endOfMonth(now), 'yyyy-MM-dd'),
  };
}
export const previousEquivalentRange = (range: DateRange): DateRange =>
  shiftRange(range, -daysBetweenInclusive(range.start, range.end));
