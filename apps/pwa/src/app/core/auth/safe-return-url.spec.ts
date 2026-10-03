// SPDX-License-Identifier: EUPL-1.2
import { safeReturnUrl } from './safe-return-url';

describe('safeReturnUrl', () => {
  it.each(['/capture?x=1', '/now', '/account', '/now;x=1'])('keeps %s', (value) => {
    expect(safeReturnUrl(value)).toBe(value);
  });

  it.each([
    ['a protocol-relative URL', '//evil.com'],
    ['an absolute URL', 'https://evil.com'],
    ['a slash-backslash prefix', '/\\evil'],
    ['a tab control character', '/\t/evil.com'],
    ['a backslash inside', '/a\\b'],
    ['a newline', '/a\nb'],
    ['a NUL', '/a\u0000b'],
    ['a DEL', '/a\u007fb'],
    ['/signin', '/signin'],
    ['/signin with a query', '/signin?returnUrl=%2Fnow'],
    ['/signin with a fragment', '/signin#x'],
    ['/signup', '/signup'],
    ['a child of /signup', '/signup/x'],
    ['/recover', '/recover'],
    ['/recovered', '/recovered'],
    ['a child of /recover', '/recover/x'],
    ['an empty string', ''],
    ['a relative path', 'now'],
    ['/recovered with a matrix parameter', '/recovered;x'],
    ['a percent-encoded /recovered', '/%72ecovered'],
    ['/signin with a matrix parameter', '/signin;x'],
    ['a percent-encoded /signup', '/%73ignup'],
    ['/signin with a trailing slash', '/signin/'],
  ])('falls back to /now for %s', (_name, value) => {
    expect(safeReturnUrl(value)).toBe('/now');
  });

  it('falls back to /now for null', () => {
    expect(safeReturnUrl(null)).toBe('/now');
  });

  it('falls back to /now for undefined', () => {
    expect(safeReturnUrl(undefined)).toBe('/now');
  });
});
