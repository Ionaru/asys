// SPDX-License-Identifier: EUPL-1.2
import { HttpErrorResponse } from '@angular/common/http';

import { HttpOutcomeTag, callApi, errorTagOf } from './http-outcome';

describe('HttpOutcomeTag', () => {
  it('names the two outcomes', () => {
    expect(HttpOutcomeTag.Ok).toBe('Ok');
    expect(HttpOutcomeTag.Failed).toBe('Failed');
  });
});

describe('errorTagOf', () => {
  it('reads the _tag of an object body', () => {
    expect(errorTagOf({ _tag: 'Unauthorized' })).toBe('Unauthorized');
  });

  it('reads extra fields next to the _tag without caring', () => {
    expect(errorTagOf({ _tag: 'CommandRejected', reason: 'invalid_title' })).toBe(
      'CommandRejected',
    );
  });

  it('parses a JSON string body and reads its _tag', () => {
    expect(errorTagOf('{"_tag":"PasskeyLastCredential"}')).toBe('PasskeyLastCredential');
  });

  it.each([
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['a string that is not JSON', 'oops'],
    ['a non-string _tag', { _tag: 5 }],
    ['an object without a _tag', {}],
    ['a JSON string without a _tag', '{}'],
    ['a JSON string with a non-string _tag', '{"_tag":5}'],
    ['a number', 42],
    ['a JSON string holding a bare string', '"Unauthorized"'],
  ])('gives null for %s', (_name, body) => {
    expect(errorTagOf(body)).toBeNull();
  });
});

describe('callApi', () => {
  it('turns a resolved promise into Ok with its value', async () => {
    expect(await callApi(Promise.resolve({ recoveryCodesLeft: 3 }))).toEqual({
      _tag: HttpOutcomeTag.Ok,
      value: { recoveryCodesLeft: 3 },
    });
  });

  it('turns a promise resolved with undefined into Ok with undefined', async () => {
    expect(await callApi(Promise.resolve(undefined))).toStrictEqual({
      _tag: HttpOutcomeTag.Ok,
      value: undefined,
    });
  });

  it.each([
    [
      'an object body',
      new HttpErrorResponse({ status: 409, error: { _tag: 'PasskeyLastCredential' } }),
      409,
      'PasskeyLastCredential',
    ],
    [
      'a JSON-string text body',
      new HttpErrorResponse({ status: 401, error: '{"_tag":"Unauthorized"}' }),
      401,
      'Unauthorized',
    ],
    ['a null body', new HttpErrorResponse({ status: 500, error: null }), 500, null],
    [
      'a network failure',
      new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }),
      0,
      null,
    ],
  ])('turns an HttpErrorResponse with %s into Failed', async (_name, error, status, errorTag) => {
    const outcome = callApi(Promise.reject(error));

    await expect(outcome).resolves.toEqual({ _tag: HttpOutcomeTag.Failed, status, errorTag });
  });

  it.each([
    ['an Error', new Error('boom')],
    ['a string', 'boom'],
  ])('turns a rejection with %s into Failed with status 0', async (_name, reason) => {
    const outcome = callApi(Promise.reject(reason));

    await expect(outcome).resolves.toEqual({
      _tag: HttpOutcomeTag.Failed,
      status: 0,
      errorTag: null,
    });
  });
});
