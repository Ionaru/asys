// SPDX-License-Identifier: EUPL-1.2
import { DefaultUrlSerializer } from '@angular/router';

const DEFAULT_URL = '/now';

const AUTH_PATHS: readonly string[] = ['/signin', '/signup', '/recover', '/recovered'];

const AUTH_SEGMENTS: readonly string[] = ['signin', 'signup', 'recover', 'recovered'];

// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\\\u0000-\u001f\u007f]/;

/** A same-origin path safe to navigate to after sign-in, or `/now` when `value` is not one. */
export const safeReturnUrl = (value: string | null | undefined): string => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_URL;
  }

  if (UNSAFE_CHARACTERS.test(value)) {
    return DEFAULT_URL;
  }

  const path = value.split(/[?#]/, 1)[0] ?? value;

  if (AUTH_PATHS.some((authPath) => path === authPath || path.startsWith(`${authPath}/`))) {
    return DEFAULT_URL;
  }

  try {
    const first = new DefaultUrlSerializer().parse(value).root.children['primary']?.segments[0]
      ?.path;

    if (first !== undefined && AUTH_SEGMENTS.includes(first)) {
      return DEFAULT_URL;
    }
  } catch {
    return DEFAULT_URL;
  }

  return value;
};
