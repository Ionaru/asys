// SPDX-License-Identifier: EUPL-1.2
import { HttpContext, HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import {
  type Change,
  type Command,
  type DomainState,
  NotApplicableReason,
  RejectedReason,
} from '@asys/domain';

import { Api } from '../../../generated/api/api';
import { dataChanges } from '../../../generated/api/fn/data/data-changes';
import { dataRunCommand } from '../../../generated/api/fn/data/data-run-command';
import { dataSnapshot } from '../../../generated/api/fn/data/data-snapshot';
import { callApi, errorTagOf, HttpOutcomeTag, type HttpOutcome } from './http-outcome';
import { KEEPALIVE } from './keepalive';
import {
  type CommandResultWire,
  type CommandWithKey,
  fromWire,
  toWire,
  type WithSeq,
} from './wire';

/** The server state at a sequence number. */
export interface SnapshotData {
  readonly seq: number;
  readonly state: DomainState;
}

/** A change with its sequence number. */
export type ChangeEntry = Change & { readonly seq: number };

/** The changes after a sequence number, in order. */
export interface ChangesData {
  readonly seq: number;
  readonly entries: readonly ChangeEntry[];
}

/** How a command submission ended. */
export enum CommandOutcomeTag {
  Applied = 'Applied',
  NotApplicable = 'NotApplicable',
  Rejected = 'Rejected',
  KeyReused = 'KeyReused',
  SignedOut = 'SignedOut',
  Failed = 'Failed',
}

/** The outcome of `runCommand`. */
export type CommandOutcome =
  | { readonly _tag: CommandOutcomeTag.Applied; readonly seq: number }
  | {
      readonly _tag: CommandOutcomeTag.NotApplicable;
      readonly reason: NotApplicableReason;
      readonly reviewItemId: string;
    }
  | { readonly _tag: CommandOutcomeTag.Rejected; readonly reason: RejectedReason }
  | { readonly _tag: CommandOutcomeTag.KeyReused }
  | { readonly _tag: CommandOutcomeTag.SignedOut }
  | { readonly _tag: CommandOutcomeTag.Failed; readonly status: number };

/** Whether sending the command again may still apply it: after Failed with its key, after KeyReused with a new one. */
export const isRetryable = (tag: CommandOutcomeTag): boolean =>
  tag === CommandOutcomeTag.Failed || tag === CommandOutcomeTag.KeyReused;

/** Reads the working-set data and submits commands. Never rejects, keeps no state. */
@Service()
export class DataApi {
  readonly #api = inject(Api);

  /** `GET /v1/snapshot`. */
  async snapshot(): Promise<HttpOutcome<SnapshotData>> {
    const outcome = await callApi(this.#api.invoke(dataSnapshot));

    if (outcome._tag === HttpOutcomeTag.Failed) {
      return outcome;
    }

    const { blockers, ...rest } = outcome.value;
    const { seq, ...state } = fromWire<WithSeq<DomainState>>({ ...rest, links: blockers });

    return { _tag: HttpOutcomeTag.Ok, value: { seq, state } };
  }

  /** `GET /v1/changes?after=<after>`. */
  async changes(after: number): Promise<HttpOutcome<ChangesData>> {
    const outcome = await callApi(this.#api.invoke(dataChanges, { after: String(after) }));

    if (outcome._tag === HttpOutcomeTag.Failed) {
      return outcome;
    }

    return {
      _tag: HttpOutcomeTag.Ok,
      value: {
        seq: outcome.value.seq,
        entries: fromWire<ChangeEntry[]>(outcome.value.entries),
      },
    };
  }

  /** `POST /v1/commands`. With `keepalive`, the request outlives the page. */
  async runCommand(
    command: Command,
    idempotencyKey: string,
    options?: { readonly keepalive?: boolean },
  ): Promise<CommandOutcome> {
    try {
      const context = options?.keepalive ? new HttpContext().set(KEEPALIVE, true) : undefined;
      const result = await this.#api.invoke(
        dataRunCommand,
        { body: toWire<CommandWithKey>({ ...command, idempotencyKey }) },
        context,
      );

      return fromWire<CommandResultWire>(result);
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        return failureOutcome(error.status, error.error);
      }

      return { _tag: CommandOutcomeTag.Failed, status: 0 };
    }
  }
}

const isRejectedReason = (value: unknown): value is RejectedReason =>
  Object.values<unknown>(RejectedReason).includes(value);

const failureOutcome = (status: number, body: unknown): CommandOutcome => {
  const errorTag = errorTagOf(body);

  if (status === HttpStatusCode.Unauthorized && errorTag === 'Unauthorized') {
    return { _tag: CommandOutcomeTag.SignedOut };
  }

  if (status === HttpStatusCode.Conflict && errorTag === 'IdempotencyKeyReused') {
    return { _tag: CommandOutcomeTag.KeyReused };
  }

  if (status === HttpStatusCode.UnprocessableEntity && errorTag === 'CommandRejected') {
    const reason =
      typeof body === 'object' && body !== null && 'reason' in body ? body.reason : null;

    if (isRejectedReason(reason)) {
      return { _tag: CommandOutcomeTag.Rejected, reason };
    }
  }

  return { _tag: CommandOutcomeTag.Failed, status };
};
