import Handlebars from 'handlebars';
import {
  and,
  camelCase,
  escapeString,
  first,
  formatJSDoc,
  getDefault,
  getMax,
  getMin,
  httpMethodLower,
  ifEquals,
  includes,
  indent,
  isNotEmpty,
  isRequired,
  isTruthy,
  join,
  json,
  kebabCase,
  last,
  not,
  or,
  pascalCase,
  pluralize,
  registerHelpers,
  singularize,
  snakeCase,
  toTypeScriptType,
  toZodType,
  upperSnakeCase
} from '../../src/template-engine/helpers';

describe('template helper behavior', () => {
  it('converts identifiers and pluralizes common English endings', () => {
    expect(pascalCase('user_profile-name')).toBe('UserProfileName');
    expect(camelCase('user_profile-name')).toBe('userProfileName');
    expect(kebabCase('UserProfile_name')).toBe('user-profile-name');
    expect(snakeCase('UserProfile-name')).toBe('user_profile_name');
    expect(upperSnakeCase('userProfile-name')).toBe('USER_PROFILE_NAME');

    expect(pluralize('category')).toBe('categories');
    for (const word of ['bus', 'box', 'quiz', 'match', 'dish']) {
      expect(pluralize(word)).toBe(`${word}es`);
    }
    expect(pluralize('todo')).toBe('todos');

    expect(singularize('categories')).toBe('category');
    expect(singularize('boxes')).toBe('box');
    expect(singularize('todos')).toBe('todo');
    expect(singularize('sheep')).toBe('sheep');
  });

  it('maps supported field types and uses safe fallback types', () => {
    const types: Record<string, string> = {
      string: 'string', number: 'number', integer: 'number', boolean: 'boolean',
      datetime: 'Date', date: 'Date', time: 'string', uuid: 'string', json: 'any', array: 'any[]'
    };
    const zodTypes: Record<string, string> = {
      string: 'z.string()', number: 'z.number()', integer: 'z.number().int()',
      boolean: 'z.boolean()', datetime: 'z.date()', date: 'z.date()', time: 'z.string()',
      uuid: 'z.string().uuid()', json: 'z.any()', array: 'z.array(z.any())'
    };
    for (const [fieldType, expected] of Object.entries(types)) {
      expect(toTypeScriptType(fieldType)).toBe(expected);
      expect(toZodType(fieldType)).toBe(zodTypes[fieldType]);
    }
    expect(toTypeScriptType('unknown')).toBe('any');
    expect(toZodType('unknown')).toBe('z.any()');
    expect(httpMethodLower('PATCH')).toBe('patch');
  });

  it('reads constraints without losing valid false or zero values', () => {
    const constraints = [
      { type: 'required' },
      { type: 'default', value: false },
      { type: 'max', value: 0 },
      { type: 'min', value: 1 }
    ];
    expect(isRequired(constraints)).toBe(true);
    expect(isRequired([])).toBe(false);
    expect(getDefault(constraints)).toBe(false);
    expect(getDefault([])).toBeUndefined();
    expect(getMax(constraints)).toBe(0);
    expect(getMax([])).toBeUndefined();
    expect(getMin(constraints)).toBe(1);
    expect(getMin([])).toBeUndefined();
  });

  it('formats comments, indentation, collections, and inclusion checks', () => {
    expect(formatJSDoc('A summary', '  ')).toBe('  /** A summary */');
    expect(formatJSDoc('First\nSecond', '*')).toBe('*/**\n* * First\n* * Second\n* */');
    expect(indent('first\nsecond', 2)).toBe('  first\n  second');
    expect(indent('', 2)).toBe('  ');
    expect(isTruthy('value')).toBe(true);
    expect(isTruthy(0)).toBe(false);
    expect(isNotEmpty(['item'])).toBe(true);
    expect(isNotEmpty([])).toBe(false);
    expect(isNotEmpty(null as unknown as any[])).toBe(null);
    expect(join(['a', 'b'], ',')).toBe('a,b');
    expect(first(['a', 'b'])).toBe('a');
    expect(first([])).toBeUndefined();
    expect(last(['a', 'b'])).toBe('b');
    expect(last([])).toBeUndefined();
    expect(includes('notification', 'fic')).toBe(true);
    expect(includes('', 'fic')).toBe(false);
    expect(includes('notification', 'missing')).toBe(false);
  });

  it('supports Handlebars conditions, JSON output, and code-string escaping', () => {
    const context = { marker: 'scope' };
    const options = {
      fn: (value: unknown) => `equal:${(value as typeof context).marker}`,
      inverse: (value: unknown) => `different:${(value as typeof context).marker}`
    };
    expect(ifEquals.call(context, 1, 1, options)).toBe('equal:scope');
    expect(ifEquals.call(context, 1, 2, options)).toBe('different:scope');
    expect(or(false, 0, true, {})).toBe(true);
    expect(or(false, 0, {})).toBe(false);
    expect(and(true, 'yes', {})).toBe(true);
    expect(and(true, '', {})).toBe(false);
    expect(not(false)).toBe(true);
    expect(not('value')).toBe(false);
    expect(json({ value: 1 })).toBe(JSON.stringify({ value: 1 }, null, 2));
    expect(json({ value: 1 }, 0)).toBe(JSON.stringify({ value: 1 }, null, 2));
    expect(json({ value: 1 }, 4)).toBe(JSON.stringify({ value: 1 }, null, 4));
    expect(escapeString(String.fromCharCode(92))).toBe(String.fromCharCode(92, 92));
    expect(escapeString(String.fromCharCode(34))).toBe(String.fromCharCode(92, 34));
    expect(escapeString(String.fromCharCode(39))).toBe(String.fromCharCode(92, 39));
    expect(escapeString(String.fromCharCode(10))).toBe('\\n');
    expect(escapeString(String.fromCharCode(13))).toBe('\\r');
    expect(escapeString(String.fromCharCode(9))).toBe('\\t');
    expect(escapeString('plain')).toBe('plain');
  });

  it('registers all helpers for isolated Handlebars instances', () => {
    const handlebars = Handlebars.create();
    registerHelpers(handlebars);
    expect(handlebars.compile('{{pascalCase value}}')({ value: 'user_name' })).toBe('UserName');
    expect(handlebars.compile('{{#ifEquals left right}}yes{{else}}no{{/ifEquals}}')({
      left: 'same', right: 'different'
    })).toBe('no');
  });
});
