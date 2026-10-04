// SPDX-License-Identifier: EUPL-1.2

// pg ships no types and the workspace has no @types/pg; reset-db.mts only needs this much of it.
declare module 'pg' {
  export class Client {
    constructor(config: { connectionString: string });
    connect(): Promise<void>;
    query(sql: string): Promise<unknown>;
    end(): Promise<void>;
  }

  const pg: { Client: typeof Client };
  export default pg;
}
