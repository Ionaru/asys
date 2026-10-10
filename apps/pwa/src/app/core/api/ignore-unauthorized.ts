// SPDX-License-Identifier: EUPL-1.2
import { HttpContextToken } from '@angular/common/http';

/** Marks a request sent before the session is known, so its 401 never signs out a later session. */
export const IGNORE_UNAUTHORIZED = new HttpContextToken<boolean>(() => false);
