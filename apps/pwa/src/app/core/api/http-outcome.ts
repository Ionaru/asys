// SPDX-License-Identifier: EUPL-1.2
import { HttpErrorResponse } from '@angular/common/http';

/** Whether a generated call succeeded. */
export enum HttpOutcomeTag {
  Ok = 'Ok',
  Failed = 'Failed',
}

/** The result of a generated call: the body, or the HTTP status and the server's error tag. */
export type HttpOutcome<T> =
  | { readonly _tag: HttpOutcomeTag.Ok; readonly value: T }
  | {
      readonly _tag: HttpOutcomeTag.Failed;
      readonly status: number;
      readonly errorTag: string | null;
    };

const tagOfObject = (body: unknown): string | null => {
  if (typeof body === 'object' && body !== null && '_tag' in body) {
    const tag = body._tag;

    return typeof tag === 'string' ? tag : null;
  }

  return null;
};

/** The `_tag` of a server error body, which is an object or (for text responses) a JSON string. */
export const errorTagOf = (body: unknown): string | null => {
  if (typeof body === 'string') {
    try {
      return tagOfObject(JSON.parse(body));
    } catch {
      return null;
    }
  }

  return tagOfObject(body);
};

/** Awaits a generated call made through `Api.invoke`. Never rejects: every failure becomes `Failed`. */
export const callApi = async <T>(call: Promise<T>): Promise<HttpOutcome<T>> => {
  try {
    return { _tag: HttpOutcomeTag.Ok, value: await call };
  } catch (error) {
    if (error instanceof HttpErrorResponse) {
      return {
        _tag: HttpOutcomeTag.Failed,
        status: error.status,
        errorTag: errorTagOf(error.error),
      };
    }

    return { _tag: HttpOutcomeTag.Failed, status: 0, errorTag: null };
  }
};
