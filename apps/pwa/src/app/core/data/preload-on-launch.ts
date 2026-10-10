// SPDX-License-Identifier: EUPL-1.2
import { Location } from '@angular/common';
import { inject } from '@angular/core';

import { SIGNED_OUT_PATHS } from '../auth/safe-return-url';
import { pathOf } from '../platform/url-path';
import { DataStore } from './data-store';

/** For an app initialiser: preloads the snapshot beside the session check, unless the launch lands on a sign-in screen. */
export const preloadOnLaunch = (): void => {
  if (!SIGNED_OUT_PATHS.includes(pathOf(inject(Location).path()))) {
    inject(DataStore).preload();
  }
};
