// SPDX-License-Identifier: MIT

import { Clock, Context, Duration, Effect, Layer, Option } from 'effect';

/** What a pending challenge was issued for. */
export enum ChallengePurpose {
  Register = 'register',
  Authenticate = 'authenticate',
  Add = 'add',
}

/** A pending challenge and what it was issued for. */
export type ChallengeEntry =
  | {
      readonly purpose: ChallengePurpose.Register;
      readonly challenge: string;
      readonly userId: string;
      readonly userName: string;
    }
  | { readonly purpose: ChallengePurpose.Authenticate; readonly challenge: string }
  | {
      readonly purpose: ChallengePurpose.Add;
      readonly challenge: string;
      readonly userId: string;
    };

/** Short-lived, single-use storage for pending challenges, keyed by the challenge id. */
export class PasskeyChallenges extends Context.Service<
  PasskeyChallenges,
  {
    /** Stores the entry under the challenge id. */
    readonly put: (challengeId: string, entry: ChallengeEntry) => Effect.Effect<void>;
    /** Removes the entry and returns it, or none when it is unknown, already taken or expired. */
    readonly take: (challengeId: string) => Effect.Effect<Option.Option<ChallengeEntry>>;
  }
>()('effect-passkeys/PasskeyChallenges') {
  /**
   * An in-memory store; each build of the layer holds its own. An entry put at time P is
   * returned by a `take` before P + ttl (default 5 minutes). Each purpose holds at most
   * `capacityPerPurpose` entries (default 1000): a `put` into a full partition first evicts
   * that partition's oldest entry.
   */
  static readonly memory = (options?: {
    readonly ttl?: Duration.Input;
    readonly capacityPerPurpose?: number;
  }): Layer.Layer<PasskeyChallenges> =>
    Layer.sync(PasskeyChallenges)(() => {
      const ttl = Duration.toMillis(options?.ttl ?? Duration.minutes(5));
      const capacity = options?.capacityPerPurpose ?? 1000;
      const partitions = new Map<
        ChallengePurpose,
        Map<string, { entry: ChallengeEntry; expiresAt: number }>
      >();
      const partitionOf = (purpose: ChallengePurpose) => {
        let partition = partitions.get(purpose);
        if (partition === undefined) {
          partition = new Map();
          partitions.set(purpose, partition);
        }
        return partition;
      };
      const findHolder = (challengeId: string) => {
        for (const partition of partitions.values()) {
          if (partition.has(challengeId)) {
            return partition;
          }
        }
        return undefined;
      };

      return {
        put: (challengeId, entry) =>
          Effect.flatMap(Clock.currentTimeMillis, (now) =>
            Effect.sync(() => {
              findHolder(challengeId)?.delete(challengeId);
              const partition = partitionOf(entry.purpose);
              while (partition.size >= capacity) {
                const oldest = partition.keys().next();
                if (oldest.done === true) {
                  break;
                }
                partition.delete(oldest.value);
              }
              partition.set(challengeId, { entry, expiresAt: now + ttl });
            }),
          ),
        take: (challengeId) =>
          Effect.flatMap(Clock.currentTimeMillis, (now) =>
            Effect.sync(() => {
              const partition = findHolder(challengeId);
              const held = partition?.get(challengeId);
              partition?.delete(challengeId);
              return held !== undefined && now < held.expiresAt
                ? Option.some(held.entry)
                : Option.none();
            }),
          ),
      };
    });
}
