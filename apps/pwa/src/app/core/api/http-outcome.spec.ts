// SPDX-License-Identifier: EUPL-1.2
import { HttpOutcomeTag, errorTagOf } from './http-outcome';

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
