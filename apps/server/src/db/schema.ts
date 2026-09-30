// SPDX-License-Identifier: EUPL-1.2
import { sql } from 'drizzle-orm';
import { pgPolicy, pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const trialItems = pgTable(
  'trial_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull(),
    title: text('title').notNull(),
  },
  (t) => [
    // nullif: after a transaction-local set_config the setting reads '' (not
    // NULL) on the same connection, and ''::uuid would raise an error.
    pgPolicy('trial_items_owner', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${t.ownerId} = nullif(current_setting('app.owner_id', true), '')::uuid`,
      withCheck: sql`${t.ownerId} = nullif(current_setting('app.owner_id', true), '')::uuid`,
    }),
  ],
);
