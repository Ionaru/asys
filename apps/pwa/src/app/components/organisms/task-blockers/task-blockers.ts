// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, inject, input, model, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button, ButtonSize, ButtonVariant } from '../../atoms/button/button';
import { IconName } from '../../atoms/icon/icon';
import { Link } from '../../atoms/link/link';
import { TextField } from '../../molecules/text-field/text-field';
import { SectionHeader, SectionHeaderAction } from '../section-header/section-header';
import { Sheet } from '../sheet/sheet';

/** One Task this Task waits for: its link, the blocker's title and whether its Remove send is in flight. */
export interface TaskBlockerRow {
  readonly linkId: string;
  readonly title: string;
  readonly busy: boolean;
}

/** A Task the section links to or offers as a blocker. */
export interface TaskBlockerTask {
  readonly id: string;
  readonly title: string;
}

/** The Blocked by section of the Task editor: a header with a one-line summary that opens a sheet. */
@Component({
  selector: 'asys-task-blockers',
  imports: [Button, Link, RouterLink, SectionHeader, Sheet, TextField],
  templateUrl: './task-blockers.component.html',
  styleUrl: './task-blockers.css',
})
export class TaskBlockers {
  /** The one-line summary under the header. */
  readonly summary = input.required<string>();

  /** The Tasks this Task waits for, in link order. */
  readonly blockedBy = input.required<readonly TaskBlockerRow[]>();

  /** The Tasks that wait for this one. */
  readonly blocks = input.required<readonly TaskBlockerTask[]>();

  /** The Tasks offered as a blocker, already filtered by the Find a Task text. */
  readonly candidates = input.required<readonly TaskBlockerTask[]>();

  /** The message of a failed Add or Remove. */
  readonly message = input.required<string>();

  /** True while the editor is leaving, the Task awaits sync, or the editor is read-only. */
  readonly busy = input<boolean>(false);

  /** Whether an AddBlocker from this section is in flight. */
  readonly adding = input<boolean>(false);

  /** The Find a Task text. */
  readonly filter = model<string>('');

  /** Asks to make a Task a blocker; carries the blocker's Task id. */
  readonly add = output<string>();

  /** Asks to remove a blocker; carries the link id. */
  readonly remove = output<string>();

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly Icons = IconName;

  protected readonly SectionHeaderAction = SectionHeaderAction;

  protected readonly open = signal(false);

  /** Focuses the Remove button at this index, else the last one, else the Find a Task field, if rendered. */
  focusRemove(index: number): void {
    const removes =
      this.#host.nativeElement.querySelectorAll<HTMLElement>('.task-blockers__remove');

    (removes[index] ?? removes[removes.length - 1] ?? this.#findInput())?.focus();
  }

  /** Focuses the Find a Task field, if rendered. */
  focusFilter(): void {
    this.#findInput()?.focus();
  }

  #findInput(): HTMLElement | undefined {
    return (
      this.#host.nativeElement.querySelector<HTMLElement>('asys-text-field textarea') ?? undefined
    );
  }
}
