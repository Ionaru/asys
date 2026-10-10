// SPDX-License-Identifier: EUPL-1.2
import { HttpErrorResponse, type HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { errorTagOf } from '../api/http-outcome';
import { Session } from './session';

/**
 * Turns a server-side sign-out (a 401 with the Unauthorized tag) into a local one. Always
 * rethrows the error.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(Session);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === HttpStatusCode.Unauthorized &&
        errorTagOf(error.error) === 'Unauthorized'
      ) {
        session.signedOut();
      }

      return throwError(() => error);
    }),
  );
};
