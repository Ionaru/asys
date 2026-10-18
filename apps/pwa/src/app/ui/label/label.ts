// SPDX-License-Identifier: EUPL-1.2
import { Directive } from '@angular/core';

/** The design system label, applied to a `label` or a `legend` as `asys-label`. */
@Directive({
  selector: 'label[asys-label], legend[asys-label]',
  host: { class: 'asys-label' },
})
export class Label {}
