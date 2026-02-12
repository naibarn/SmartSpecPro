declare module "stripe" {
  const Stripe: any;
  export default Stripe;
}

declare module "pg" {
  export class Pool {
    constructor(config?: Record<string, unknown>);
    query(sql: string): Promise<{ rows: any[] }>;
    end(): Promise<void>;
  }
}
