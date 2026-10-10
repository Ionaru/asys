// SPDX-License-Identifier: EUPL-1.2
import { inject, Service, signal } from '@angular/core';
import type { Command } from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../api/data-api';
import { Ids } from '../platform/ids';
import { commandSubject } from './command-subject';
import { DataStore } from './data-store';

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeys(record[key]);
    }

    return sorted;
  }

  return value;
};

const canonicalJson = (value: unknown): string => JSON.stringify(sortKeys(value));

/** A key and the kind and subject of the command it was made for. */
interface Attempt {
  readonly key: string;
  readonly tag: Command['_tag'];
  readonly subject: string;
}

/**
 * The idempotency key of each command a screen is still trying to send, so a retry of the same
 * command reuses its key, and the subjects it has a send in flight for. Provide it per screen:
 * `providers: [CommandAttempts]`.
 */
@Service({ autoProvided: false })
export class CommandAttempts {
  readonly #ids = inject(Ids);

  readonly #dataStore = inject(DataStore);

  readonly #attempts = new Map<string, Attempt>();

  /** How many sends are in flight for each subject; a subject with none is absent. */
  readonly #inFlight = signal<ReadonlyMap<string, number>>(new Map());

  /** The key for this command: the one it already has, else a new one from `Ids.next()`. */
  keyFor(command: Command): string {
    const canonical = canonicalJson(command);
    const existing = this.#attempts.get(canonical);

    if (existing !== undefined) {
      return existing.key;
    }

    const key = this.#ids.next();

    this.#attempts.set(canonical, { key, tag: command._tag, subject: commandSubject(command) });

    return key;
  }

  /**
   * Forgets the command's key unless the outcome is Failed, so a retry after Failed reuses it.
   * Any other outcome also ends earlier attempts of the same kind on the same subject: choosing
   * that value again later is a new intent, not a retry, and must not replay an old key.
   */
  settle(command: Command, outcome: CommandOutcome): void {
    if (outcome._tag === CommandOutcomeTag.Failed) {
      return;
    }

    const subject = commandSubject(command);

    this.#attempts.delete(canonicalJson(command));

    for (const [canonical, attempt] of this.#attempts) {
      if (attempt.tag === command._tag && attempt.subject === subject) {
        this.#attempts.delete(canonical);
      }
    }
  }

  /**
   * Sends the command through `DataStore.send` with its key, then settles it with the outcome. The
   * command's subject counts as in flight (see `busy`) from the call until the outcome, or a
   * rejection, arrives.
   */
  send(command: Command): Promise<CommandOutcome> {
    return this.track(commandSubject(command), async () => {
      const outcome = await this.#dataStore.send(command, this.keyFor(command));

      this.settle(command, outcome);

      return outcome;
    });
  }

  /**
   * Runs the work with the subject counted as in flight until it settles or rejects, for a send
   * that does not go through `send`, such as the time zone choice.
   */
  async track<T>(subject: string, work: () => Promise<T>): Promise<T> {
    this.#inFlight.update((counts) => new Map(counts).set(subject, (counts.get(subject) ?? 0) + 1));

    try {
      return await work();
    } finally {
      this.#inFlight.update((counts) => {
        const next = new Map(counts);
        const remaining = (counts.get(subject) ?? 0) - 1;

        if (remaining > 0) {
          next.set(subject, remaining);
        } else {
          next.delete(subject);
        }

        return next;
      });
    }
  }

  /**
   * Whether a send for this subject is in flight here, or `DataStore.awaitingSync()` holds it.
   * Reactive: read it from a template or a `computed` to disable the subject's controls.
   */
  busy(subject: string): boolean {
    return this.#inFlight().has(subject) || this.#dataStore.awaitingSync().has(subject);
  }
}
