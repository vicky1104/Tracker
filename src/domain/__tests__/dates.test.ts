import {
  addDays,
  addMonths,
  dateRange,
  daysInMonth,
  diffDays,
  endOfMonth,
  formatLocalDate,
  isLeapYear,
  isValidLocalDate,
  localDateOf,
  startOfWeek,
  weekdayOf,
} from '../dates';

describe('local dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2023-03-01', -1)).toBe('2023-02-28');
  });

  it('handles leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(isValidLocalDate('2023-02-29')).toBe(false);
    expect(isValidLocalDate('2024-02-29')).toBe(true);
  });

  it('computes day differences that ignore DST', () => {
    // US DST starts 2024-03-10 and ends 2024-11-03; EU on 2024-03-31 / 2024-10-27.
    expect(diffDays('2024-03-09', '2024-03-11')).toBe(2);
    expect(diffDays('2024-10-26', '2024-10-28')).toBe(2);
    expect(dateRange('2024-03-30', '2024-04-01')).toEqual(['2024-03-30', '2024-03-31', '2024-04-01']);
  });

  it('clamps month addition', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2023-01-31', 1)).toBe('2023-02-28');
    expect(addMonths('2024-12-15', 1)).toBe('2025-01-15');
    expect(addMonths('2024-01-15', -1)).toBe('2023-12-15');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
  });

  it('computes weekdays and week starts', () => {
    expect(weekdayOf('2024-01-01')).toBe(1); // Monday
    expect(startOfWeek('2024-01-03', 1)).toBe('2024-01-01');
    expect(startOfWeek('2024-01-03', 0)).toBe('2023-12-31');
    expect(startOfWeek('2024-01-06', 6)).toBe('2024-01-06');
    expect(startOfWeek('2024-01-05', 6)).toBe('2023-12-30');
  });

  it('derives the local date of an instant in a given time zone', () => {
    const instant = new Date('2024-06-30T23:30:00Z');
    expect(localDateOf(instant, 'UTC')).toBe('2024-06-30');
    expect(localDateOf(instant, 'Asia/Kolkata')).toBe('2024-07-01');
    expect(localDateOf(instant, 'America/Los_Angeles')).toBe('2024-06-30');
    // Across a DST change in New York
    expect(localDateOf(new Date('2024-03-10T06:30:00Z'), 'America/New_York')).toBe('2024-03-10');
  });

  it('formats a date without shifting by the device time zone', () => {
    expect(formatLocalDate('2024-01-01', { day: 'numeric', month: 'short' }, 'en-US')).toBe('Jan 1');
  });
});
