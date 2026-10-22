// SPDX-License-Identifier: EUPL-1.2
import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { pathOf } from '../platform/url-path';
import { Session, SessionState } from './session';

const SIGN_UP_PATH = '/signup';

/**
 * Lets signed-in, remembered and unreachable visitors in, so a launch works offline; sends the rest to
 * sign-in. Only an Unknown session waits for the server, because a remembered one needs no answer to show.
 */
export const signedInGuard: CanActivateFn = async (_route, state) => {
  const session = inject(Session);
  const router = inject(Router);

  if (session.state() === SessionState.Unknown) {
    await session.check();
  }

  if (session.state() === SessionState.SignedOut) {
    return router.createUrlTree(['/signin'], { queryParams: { returnUrl: state.url } });
  }

  return true;
};

/**
 * Keeps signed-in visitors off the sign-in screens, except sign-up, which says so itself. A remembered
 * session waits for the server here too, because only its answer tells a sign-in screen from Now.
 */
export const signedOutGuard: CanActivateFn = async (_route, state) => {
  const session = inject(Session);
  const router = inject(Router);

  if (session.state() === SessionState.Unknown || session.state() === SessionState.Remembered) {
    await session.check();
  }

  if (session.state() === SessionState.SignedIn && pathOf(state.url) !== SIGN_UP_PATH) {
    return router.createUrlTree(['/now']);
  }

  return true;
};
