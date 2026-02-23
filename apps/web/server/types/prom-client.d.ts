declare module "prom-client" {
  export const register: {
    contentType: string;
    metrics: () => Promise<string>;
  };

  export function collectDefaultMetrics(config?: { prefix?: string }): void;

  export class Histogram<TLabel extends string = string> {
    constructor(config: {
      name: string;
      help: string;
      labelNames?: readonly TLabel[] | string[];
      buckets?: number[];
    });
    observe(labels: Record<TLabel, string> | Record<string, string>, value: number): void;
  }

  export class Counter<TLabel extends string = string> {
    constructor(config: {
      name: string;
      help: string;
      labelNames?: readonly TLabel[] | string[];
    });
    inc(labels?: Record<TLabel, string> | Record<string, string>, value?: number): void;
  }
}
