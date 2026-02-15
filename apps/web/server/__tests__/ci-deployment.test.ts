import { describe, it, expect } from 'vitest';

/**
 * CI/CD Deployment Configuration Tests
 *
 * Validates canary deployment logic, traffic splitting,
 * and rollback behavior used by GitHub Actions workflows.
 */

interface TrafficSplit {
  revisionName: string;
  percent: number;
}

interface DeploymentConfig {
  service: string;
  environment: 'staging' | 'production' | 'preview';
  traffic: TrafficSplit[];
}

function validateTrafficSplit(config: DeploymentConfig): {
  valid: boolean;
  error?: string;
} {
  const totalPercent = config.traffic.reduce((sum, t) => sum + t.percent, 0);
  if (totalPercent !== 100) {
    return {
      valid: false,
      error: `Traffic must sum to 100%, got ${totalPercent}%`,
    };
  }
  for (const t of config.traffic) {
    if (t.percent < 0 || t.percent > 100) {
      return {
        valid: false,
        error: `Invalid traffic percent ${t.percent} for ${t.revisionName}`,
      };
    }
  }
  return { valid: true };
}

function shouldRollback(smokeTestPassed: boolean): boolean {
  return !smokeTestPassed;
}

function buildImageTag(
  region: string,
  projectId: string,
  imageName: string,
  tag: string,
): string {
  return `${region}-docker.pkg.dev/${projectId}/smartspec-images/${imageName}:${tag}`;
}

describe('Canary Deployment', () => {
  it('should create valid canary config at 10% traffic', () => {
    const config: DeploymentConfig = {
      service: 'node-api-staging',
      environment: 'staging',
      traffic: [
        { revisionName: 'node-api-abc123', percent: 10 },
        { revisionName: 'node-api-previous', percent: 90 },
      ],
    };

    expect(config.traffic[0].percent).toBe(10);
    expect(validateTrafficSplit(config)).toEqual({ valid: true });
  });

  it('should reject traffic splits that do not sum to 100%', () => {
    const config: DeploymentConfig = {
      service: 'node-api-staging',
      environment: 'staging',
      traffic: [
        { revisionName: 'node-api-abc123', percent: 10 },
        { revisionName: 'node-api-previous', percent: 80 },
      ],
    };

    const result = validateTrafficSplit(config);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('90%');
  });

  it('should support 50% canary for production staged rollout', () => {
    const config: DeploymentConfig = {
      service: 'node-api',
      environment: 'production',
      traffic: [
        { revisionName: 'node-api-v1.2.0', percent: 50 },
        { revisionName: 'node-api-v1.1.0', percent: 50 },
      ],
    };

    expect(validateTrafficSplit(config)).toEqual({ valid: true });
  });

  it('should support 100% traffic for full rollout', () => {
    const config: DeploymentConfig = {
      service: 'node-api',
      environment: 'production',
      traffic: [{ revisionName: 'node-api-v1.2.0', percent: 100 }],
    };

    expect(validateTrafficSplit(config)).toEqual({ valid: true });
  });
});

describe('Smoke Test Rollback', () => {
  it('should rollback on failed smoke test', () => {
    expect(shouldRollback(false)).toBe(true);
  });

  it('should not rollback on passed smoke test', () => {
    expect(shouldRollback(true)).toBe(false);
  });
});

describe('Image Tagging', () => {
  it('should build correct Artifact Registry image tag', () => {
    const tag = buildImageTag(
      'asia-southeast1',
      'smartspecpro-mvp',
      'node-api',
      'abc1234',
    );

    expect(tag).toBe(
      'asia-southeast1-docker.pkg.dev/smartspecpro-mvp/smartspec-images/node-api:abc1234',
    );
  });

  it('should build PR preview image tag', () => {
    const tag = buildImageTag(
      'asia-southeast1',
      'smartspecpro-mvp',
      'node-api',
      'pr-42',
    );

    expect(tag).toContain('pr-42');
  });

  it('should build release tag for production', () => {
    const tag = buildImageTag(
      'asia-southeast1',
      'smartspecpro-mvp',
      'node-api',
      'v1.2.0',
    );

    expect(tag).toContain('v1.2.0');
  });
});
