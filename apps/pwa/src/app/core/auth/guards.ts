// SPDX-License-Identifier: EUPL-1.2
import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { pathOf } from '../platform/url-path';
import { Session, SessionState } from './session';

const SIGN_UP_PATH = '/signup';

/** Lets signed-in (or unreachable, so offline works) visitors in; sends the rest to sign-in. */
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

/** Keeps signed-in visitors off the sign-in screens, except sign-up, which says so itself. */
export const signedOutGuard: CanActivateFn = async (_route, state) => {
  const session = inject(Session);
  const router = inject(Router);

  if (session.state() === SessionState.Unknown) {
    await session.check();
  }

  if (session.state() === SessionState.SignedIn && pathOf(state.url) !== SIGN_UP_PATH) {
    return router.createUrlTree(['/now']);
  }

  return true;
};
