// SPDX-License-Identifier: EUPL-1.2
import { Directive } from '@angular/core';

/** The design system label, applied as `asys-label` to a `label`, a `legend`, or the `span` that names a group. */
@Directive({
  selector: 'label[asys-label], legend[asys-label], span[asys-label]',
  host: { class: 'asys-label' },
})
export class Label {}
