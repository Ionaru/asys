// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input } from '@angular/core';

/** Placeholder for the share target: shows what was shared. */
@Component({
  selector: 'app-capture',
  template: `
    <h1 class="capture__title">Shared with ASYS</h1>
    @if (shared().length > 0) {
      <dl class="capture__list">
        @for (entry of shared(); track entry.label) {
          <dt class="capture__label">{{ entry.label }}</dt>
          <dd class="capture__value">{{ entry.value }}</dd>
        }
      </dl>
    } @else {
      <p class="capture__text">Nothing was shared.</p>
    }
    <p class="capture__text">Quick add arrives in a later version.</p>
  `,
  styles: `
    .capture__title {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
      font-weight: 700;
    }

    .capture__list {
      margin: 0 0 var(--space-3);
    }

    .capture__label {
      color: var(--ink-muted);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
    }

    .capture__value {
      margin: 0 0 var(--space-2);
      overflow-wrap: anywhere;
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }

    .capture__text {
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }
  `,
})
export class Capture {
  readonly title = input<string | undefined>();

  readonly text = input<string | undefined>();

  readonly url = input<string | undefined>();

  protected readonly shared = computed(() => {
    const entries = [
      { label: 'Title', value: this.title() },
      { label: 'Text', value: this.text() },
      { label: 'Link', value: this.url() },
    ];

    return entries.flatMap(({ label, value }) =>
      value !== undefined && value !== '' ? [{ label, value }] : [],
    );
  });
}
