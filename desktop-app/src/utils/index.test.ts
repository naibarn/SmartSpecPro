import { describe, it, expect } from 'vitest';
import { 
  truncate, capitalize, slugify, camelToTitle,
  formatNumber, formatBytes, formatCurrency, formatPercent, clamp,
  groupBy, unique, sortBy, chunk,
  isEmpty, pick, omit,
  isValidEmail, isValidUrl, isValidJson,
  cn
} from './index';

describe('String Utilities', () => {
  it('truncate should shorten long strings', () => {
    expect(truncate('Hello World', 5)).toBe('He...');
    expect(truncate('Hello', 10)).toBe('Hello');
  });

  it('capitalize should uppercase first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('')).toBe('');
  });

  it('slugify should create URL-safe strings', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  Test  String  ')).toBe('test-string');
  });

  it('camelToTitle should convert camelCase to Title Case', () => {
    expect(camelToTitle('camelCaseString')).toBe('Camel Case String');
  });
});

describe('Number Utilities', () => {
  it('formatNumber should add commas', () => {
    expect(formatNumber(1000000)).toBe('1,000,000');
  });

  it('formatBytes should format file sizes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
  });

  it('clamp should keep number within range', () => {
    expect(clamp(10, 0, 5)).toBe(5);
    expect(clamp(-5, 0, 5)).toBe(0);
    expect(clamp(3, 0, 5)).toBe(3);
  });
});

describe('Array Utilities', () => {
  it('groupBy should group items by key', () => {
    const data = [{ id: 1, type: 'A' }, { id: 2, type: 'B' }, { id: 3, type: 'A' }];
    const grouped = groupBy(data, 'type');
    expect(grouped['A']).toHaveLength(2);
    expect(grouped['B']).toHaveLength(1);
  });

  it('unique should remove duplicates', () => {
    expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });
});

describe('Object Utilities', () => {
  it('isEmpty should check for empty objects', () => {
    expect(isEmpty({})).toBe(true);
    expect(isEmpty({ a: 1 })).toBe(false);
  });

  it('pick should select specific keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });
});

describe('Validation Utilities', () => {
  it('isValidEmail should validate emails', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('invalid-email')).toBe(false);
  });

  it('isValidUrl should validate URLs', () => {
    expect(isValidUrl('https://google.com')).toBe(true);
    expect(isValidUrl('not-a-url')).toBe(false);
  });
});

describe('Class Name Utilities', () => {
  it('cn should join class names', () => {
    expect(cn('btn', 'btn-primary', false && 'hidden', undefined, 'active')).toBe('btn btn-primary active');
  });
});
