// SPDX-License-Identifier: EUPL-1.2
import { HttpContextToken, type HttpInterceptorFn } from '@angular/common/http';

/** Marks a request to be sent with fetch `keepalive`, so it outlives the page. */
export const KEEPALIVE = new HttpContextToken<boolean>(() => false);

/** Turns the `KEEPALIVE` mark into `keepalive: true`. Other requests pass through unchanged. */
export const keepaliveInterceptor: HttpInterceptorFn = (request, next) =>
  next(request.context.get(KEEPALIVE) ? request.clone({ keepalive: true }) : request);
