// SPDX-License-Identifier: EUPL-1.2
import { Service } from '@angular/core';

/** New ids for commands and their idempotency keys; a service so specs can pin them. */
@Service()
export class Ids {
  /** A fresh lowercase UUID. */
  next(): string {
    return crypto.randomUUID();
  }
}
