// SPDX-License-Identifier: EUPL-1.2
import { Component } from '@angular/core';

import { TodayTemplate } from '../../components/templates/today-template/today-template';

/** The Today screen, a placeholder until Today arrives. */
@Component({
  selector: 'app-today',
  imports: [TodayTemplate],
  template: '<asys-today-template />',
})
export class Today {}
