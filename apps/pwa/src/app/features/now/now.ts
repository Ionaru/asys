// SPDX-License-Identifier: EUPL-1.2
import { Component, inject, signal } from '@angular/core';

import { DataStore, SyncStatus } from '../../core/data/data-store';
import { Button, ButtonVariant } from '../../ui/button/button';
import { SectionHeader } from '../../ui/section-header/section-header';

/** What to do now: the ranked Tasks, and the ones that wait. */
@Component({
  selector: 'app-now',
  imports: [Button, SectionHeader],
  template: `
    <h1 class="now__title">Now</h1>
    @if (dataStore.now(); as now) {
      @if (now.ranked.length > 0) {
        <ul class="now__list">
          @for (item of now.ranked; track item.task.id) {
            <li class="now__item">
              <span class="now__task">{{ item.task.title }}</span>
              <span class="now__reason">{{ item.reasonText }}</span>
            </li>
          }
        </ul>
      } @else {
        <p class="now__text">Nothing to do right now.</p>
      }
      @if (now.waiting.length > 0) {
        <asys-section-header
          [title]="'Waiting'"
          [count]="now.waiting.length"
          [(expanded)]="waitingExpanded"
        />
        @if (waitingExpanded()) {
          <ul class="now__list">
            @for (item of now.waiting; track item.task.id) {
              <li class="now__item">
                <span class="now__task">{{ item.task.title }}</span>
              </li>
            }
          </ul>
        }
      }
    } @else if (dataStore.status() === Status.Loading) {
      <p class="now__text">Loading…</p>
    } @else if (dataStore.status() === Status.Failed) {
      <p class="now__text" role="alert">ASYS could not load your Tasks.</p>
      <button asys-button type="button" [variant]="Variant.Quiet" (click)="dataStore.refresh()">
        Try again
      </button>
    } @else {
      <p class="now__text">Nothing to show yet.</p>
    }
  `,
  styles: `
    .now__title {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
      font-weight: 700;
    }

    .now__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .now__item {
      display: flex;
      flex-direction: column;
      padding: var(--space-3) 0;
    }

    .now__task {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
      font-size: var(--font-size-body-strong);
      line-height: var(--line-height-body-strong);
      font-weight: 600;
    }

    .now__reason {
      color: var(--ink-muted);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
    }

    .now__text {
      margin: 0;
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }
  `,
})
export class Now {
  protected readonly dataStore = inject(DataStore);

  protected readonly Status = SyncStatus;

  protected readonly Variant = ButtonVariant;

  protected readonly waitingExpanded = signal(false);
}
