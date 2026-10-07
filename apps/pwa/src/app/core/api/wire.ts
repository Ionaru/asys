// SPDX-License-Identifier: EUPL-1.2
import type {
  Area,
  BlockerLink,
  Change,
  Command,
  DomainState,
  ReviewItem,
  Settings,
  Task,
} from '@asys/domain';

import type * as Gen from '../../../generated/api';
import type { Me } from './auth-api';
import type { CommandOutcome, CommandOutcomeTag } from './data-api';

/**
 * The JSON shape of a type, so a generated model and a domain type can be compared:
 * - a string enum member becomes its string literal (`TaskStatus.Open` -> `'open'`);
 * - `readonly` is dropped, from properties, arrays and tuples alike;
 * - `any` (an empty JSON schema, `{}`) becomes `unknown`.
 * Unions (`T | null`) distribute; objects, arrays and tuples recurse. ActiveHours needs no key
 * rule: a mapped type over the numeric enum IsoWeekday already has the property names '1'..'7'.
 */
export type Wire<T> = 0 extends 1 & T
  ? unknown
  : T extends string
    ? `${T}`
    : T extends number | boolean | bigint | null | undefined
      ? T
      : T extends readonly unknown[]
        ? { -readonly [K in keyof T]: Wire<T[K]> }
        : T extends object
          ? { -readonly [K in keyof T]: Wire<T[K]> }
          : T;

/** True only when A and B are identical types (not merely mutually assignable). */
export type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type Same<G, D> = Equals<Wire<G>, Wire<D>>;

/** A value with the sequence number it was read at. */
export type WithSeq<T> = T & { readonly seq: number };

/** A command as `data.runCommand` takes it. */
export type CommandWithKey = Command & { readonly idempotencyKey: string };

/** The Snapshot as the PWA holds it: `blockers` is renamed to `links`. */
type SnapshotState = Omit<Gen.Snapshot, 'blockers'> & { readonly links: Gen.Snapshot['blockers'] };

/** What `data.runCommand` answers with 200: the Applied and NotApplicable members of CommandOutcome. */
export type CommandResultWire = Extract<
  CommandOutcome,
  { readonly _tag: CommandOutcomeTag.Applied | CommandOutcomeTag.NotApplicable }
>;

/**
 * Compile-time guard: every generated model the PWA converts must have the domain's JSON shape.
 * A drifted contract turns one entry into `false`, and its `true` below fails typecheck on that line.
 */
export const SHAPES: {
  readonly task: Same<Gen.Task, Task>;
  readonly blockerLink: Same<Gen.BlockerLink, BlockerLink>;
  readonly area: Same<Gen.Area, Area>;
  // ReviewItem.payload is unchecked by design (`any` becomes `unknown`).
  readonly reviewItem: Same<Gen.ReviewItem, ReviewItem>;
  readonly settings: Same<Gen.Settings, Settings>;
  readonly snapshot: Same<SnapshotState, WithSeq<DomainState>>;
  readonly changeEntry: Same<Gen.ChangeEntry, WithSeq<Change>>;
  readonly command: Same<Gen.Command, CommandWithKey>;
  readonly commandResult: Same<Gen.CommandResult, CommandResultWire>;
  readonly me: Same<Gen.Me, Me>;
} = {
  task: true,
  blockerLink: true,
  area: true,
  reviewItem: true,
  settings: true,
  snapshot: true,
  changeEntry: true,
  command: true,
  commandResult: true,
  me: true,
};

/**
 * Inbound conversion: a generated value whose shape SHAPES proved identical to `D`.
 * One of the two casts in the folder.
 */
export const fromWire = <D>(value: Wire<D>): D => value as D;

/** Outbound conversion: a domain value as the generated request type. The other cast. */
export const toWire = <D>(value: D): Wire<D> => value as Wire<D>;
