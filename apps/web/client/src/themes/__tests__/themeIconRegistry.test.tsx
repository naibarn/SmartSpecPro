import {isValidElement} from 'react';
import {describe, expect, it} from 'vitest';

import {butterIconRegistry} from '../butter/icons';
import {chocolateIconRegistry} from '../chocolate/icons';
import {gothicIconRegistry} from '../gothic/icons';
import {matchaIconRegistry} from '../matcha/icons';
import {stoneIconRegistry} from '../stone/icons';
import {y2kIconRegistry} from '../y2k/icons';

const registries = [
  ['butter', butterIconRegistry],
  ['chocolate', chocolateIconRegistry],
  ['gothic', gothicIconRegistry],
  ['matcha', matchaIconRegistry],
  ['stone', stoneIconRegistry],
  ['y2k', y2kIconRegistry],
] as const;

describe('theme icon registries', () => {
  it.each(registries)('%s includes first and last page icons', (_name, registry) => {
    expect(isValidElement(registry.chevronsLeft)).toBe(true);
    expect(isValidElement(registry.chevronsRight)).toBe(true);
  });
});
