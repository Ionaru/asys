// SPDX-License-Identifier: EUPL-1.2
import type { Provider } from '@angular/core';

import { provideApiConfiguration } from '../../../generated/api/api-configuration';

/** Points the generated client's `Api` at the server, which shares the PWA's origin. */
export const provideApi = (): Provider => provideApiConfiguration('');
