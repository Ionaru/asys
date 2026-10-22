// SPDX-License-Identifier: EUPL-1.2
import { Component } from '@angular/core';

import { RecoveredTemplate } from '../../components/templates/recovered-template/recovered-template';

/** Shown after a recovery code sign-in, nudging the Owner to replace lost passkeys. */
@Component({
  selector: 'asys-recovered',
  imports: [RecoveredTemplate],
  template: '<asys-recovered-template />',
})
export class Recovered {}
