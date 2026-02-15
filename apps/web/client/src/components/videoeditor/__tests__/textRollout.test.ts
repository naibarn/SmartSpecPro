/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { isTextClipRolloutEnabled } from '../textRollout';

type FeatureWindow = Window & {
  __SMARTSPEC_FEATURES__?: {
    textClipT1?: boolean;
  };
};

describe('text rollout gating', () => {
  afterEach(() => {
    delete (window as FeatureWindow).__SMARTSPEC_FEATURES__;
  });

  it('defaults to enabled when no env override exists', () => {
    expect(isTextClipRolloutEnabled({})).toBe(true);
  });

  it('disables rollout when env flag is false-like', () => {
    expect(isTextClipRolloutEnabled({ VITE_ENABLE_TEXT_CLIP_T1: 'false' })).toBe(false);
    expect(isTextClipRolloutEnabled({ VITE_ENABLE_TEXT_CLIP_T1: '0' })).toBe(false);
    expect(isTextClipRolloutEnabled({ VITE_ENABLE_TEXT_CLIP_T1: 'disabled' })).toBe(false);
  });

  it('runtime canary flag overrides env setting', () => {
    (window as FeatureWindow).__SMARTSPEC_FEATURES__ = { textClipT1: false };
    expect(isTextClipRolloutEnabled({ VITE_ENABLE_TEXT_CLIP_T1: 'true' })).toBe(false);

    (window as FeatureWindow).__SMARTSPEC_FEATURES__ = { textClipT1: true };
    expect(isTextClipRolloutEnabled({ VITE_ENABLE_TEXT_CLIP_T1: 'false' })).toBe(true);
  });
});
