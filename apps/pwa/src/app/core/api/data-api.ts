// SPDX-License-Identifier: EUPL-1.2
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import {
  type Change,
  type Command,
  type DomainState,
  NotApplicableReason,
  RejectedReason,
} from '@asys/domain';
import { firstValueFrom } from 'rxjs';

import { dataChanges } from '../../../generated/api/fn/data/data-changes';
import { dataRunCommand } from '../../../generated/api/fn/data/data-run-command';
import { dataSnapshot } from '../../../generated/api/fn/data/data-snapshot';
import { callApi, errorTagOf, HttpOutcomeTag, type HttpOutcome } from './http-outcome';
import { KEEPALIVE } from './keepalive';
import { fromWire, toWire } from './wire';

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

const HTTP_UNAUTHORIZED = 401;

const HTTP_CONFLICT = 409;

const HTTP_UNPROCESSABLE = 422;

type WithSeq<T> = T & { readonly seq: number };

type CommandWithKey = Command & { readonly idempotencyKey: string };

type CommandApplied = Extract<
  CommandOutcome,
  { readonly _tag: CommandOutcomeTag.Applied | CommandOutcomeTag.NotApplicable }
>;

/** Reads the working-set data and submits commands. Never rejects, keeps no state. */
@Service()
export class DataApi {
  private readonly http = inject(HttpClient);

  /** `GET /v1/snapshot`. */
  async snapshot(): Promise<HttpOutcome<SnapshotData>> {
    const outcome = await callApi(dataSnapshot(this.http, ''));

    if (outcome._tag === HttpOutcomeTag.Failed) {
      return outcome;
    }

    const { blockers, ...rest } = outcome.value;
    const { seq, ...state } = fromWire<WithSeq<DomainState>>({ ...rest, links: blockers });

    return { _tag: HttpOutcomeTag.Ok, value: { seq, state } };
  }

  /** `GET /v1/changes?after=<after>`. */
  async changes(after: number): Promise<HttpOutcome<ChangesData>> {
    const outcome = await callApi(dataChanges(this.http, '', { after: String(after) }));

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
      const response = await firstValueFrom(
        dataRunCommand(
          this.http,
          '',
          { body: toWire<CommandWithKey>({ ...command, idempotencyKey }) },
          context,
        ),
      );

      return fromWire<CommandApplied>(response.body);
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

  if (status === HTTP_UNAUTHORIZED && errorTag === 'Unauthorized') {
    return { _tag: CommandOutcomeTag.SignedOut };
  }

  if (status === HTTP_CONFLICT && errorTag === 'IdempotencyKeyReused') {
    return { _tag: CommandOutcomeTag.KeyReused };
  }

  if (status === HTTP_UNPROCESSABLE && errorTag === 'CommandRejected') {
    const reason =
      typeof body === 'object' && body !== null && 'reason' in body ? body.reason : null;

    if (isRejectedReason(reason)) {
      return { _tag: CommandOutcomeTag.Rejected, reason };
    }
  }

  return { _tag: CommandOutcomeTag.Failed, status };
};
