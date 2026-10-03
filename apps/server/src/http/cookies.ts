// SPDX-License-Identifier: EUPL-1.2
import { SESSION_COOKIE } from '@asys/contract';
import { Effect } from 'effect';
import { HttpEffect, HttpServerResponse } from 'effect/http';
import { HttpApiBuilder, HttpApiSecurity } from 'effect/http-api';

const sessionSecurity = HttpApiSecurity.apiKey({ key: SESSION_COOKIE, in: 'cookie' });

/**
 * Sets the session cookie on the current response: `Path=/`, `HttpOnly`, `Secure`,
 * `SameSite=Lax` and `Max-Age` of 30 days. Only handlers and the authentication middleware
 * call this, never the session functions.
 */
export const setSessionCookie = (token: string) =>
  HttpApiBuilder.securitySetCookie(sessionSecurity, token, {
    path: '/',
    sameSite: 'lax',
    maxAge: '30 days',
    httpOnly: true,
    secure: true,
  });

/** Expires the session cookie on the current response, with the same attributes it was set with. */
export const expireSessionCookie = HttpEffect.appendPreResponseHandler((_request, response) =>
  Effect.orDie(
    HttpServerResponse.expireCookie(response, SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    }),
  ),
);
