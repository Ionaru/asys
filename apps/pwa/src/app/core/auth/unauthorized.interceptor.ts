// SPDX-License-Identifier: EUPL-1.2
import {
  HttpErrorResponse,
  type HttpInterceptorFn,
  type HttpRequest,
  HttpStatusCode,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { errorTagOf } from '../api/http-outcome';
import { Session } from './session';

const PASSKEYS_PATH = '/v1/auth/passkeys';

const pathOf = (url: string): string => {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url;
  }
};

/** Add and remove answer a revoked session with a body-less 401. */
const isPasskeyWrite = (request: HttpRequest<unknown>): boolean => {
  const path = pathOf(request.url);

  if (request.method === 'POST') {
    return path === PASSKEYS_PATH;
  }

  return request.method === 'DELETE' && path.startsWith(`${PASSKEYS_PATH}/`);
};

/** Turns a server-side sign-out (401 Unauthorized) into a local one. Always rethrows the error. */
export const unauthorizedInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(Session);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.Unauthorized) {
        const tag = errorTagOf(error.error);

        if (tag === 'Unauthorized' || (tag === null && isPasskeyWrite(request))) {
          session.signedOut();
        }
      }

      return throwError(() => error);
    }),
  );
};
