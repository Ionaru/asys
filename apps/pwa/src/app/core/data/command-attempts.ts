// SPDX-License-Identifier: EUPL-1.2
import { inject, Service } from '@angular/core';
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
 * command reuses its key. Provide it per screen: `providers: [CommandAttempts]`.
 */
@Service({ autoProvided: false })
export class CommandAttempts {
  readonly #ids = inject(Ids);

  readonly #dataStore = inject(DataStore);

  readonly #attempts = new Map<string, Attempt>();

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

  /** Sends the command through `DataStore.send` with its key, then settles it with the outcome. */
  async send(command: Command): Promise<CommandOutcome> {
    const outcome = await this.#dataStore.send(command, this.keyFor(command));

    this.settle(command, outcome);

    return outcome;
  }
}
