// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { LocalDate } from '@asys/domain';

import { Button, ButtonSize, ButtonVariant } from '../../atoms/button/button';
import { IconName } from '../../atoms/icon/icon';
import { SyncNote } from '../../atoms/sync-note/sync-note';
import { Text, TextStyle } from '../../atoms/text/text';
import { LoadState } from '../../molecules/load-state/load-state';
import { ReviewItem, ReviewItemActionKind } from '../../molecules/review-item/review-item';
import { ActionBar } from '../../organisms/action-bar/action-bar';
import { Sheet } from '../../organisms/sheet/sheet';
import {
  type TaskBlockerRow,
  TaskBlockers,
  type TaskBlockerTask,
} from '../../organisms/task-blockers/task-blockers';
import {
  type AreaChoice,
  TriageCard,
  type TriageDraft,
  type TriageReason,
} from '../../organisms/triage-card/triage-card';
import { quadrantWord } from '../../support/quadrant-word';

/** One open Review item as the Inbox lists it, with its copy already written. */
export interface InboxReview {
  /** The Review item id. */
  readonly id: string;
  readonly question: string;
  readonly reason: string;
  /** The Task Open Task links to, or null for no link. */
  readonly taskId: string | null;
  /** Whether its Dismiss is pending or waits for the server. */
  readonly busy: boolean;
  /** Whether the sync note shows after it. */
  readonly awaitingSync: boolean;
}

/** The Inbox Task on the Triage card. */
export interface InboxCard {
  readonly id: string;
  /** What was captured, while it differs from the title; null hides it. */
  readonly capturedText: string | null;
  readonly awaitingSync: boolean;
}

/**
 * Lays out the Inbox: the Triage card with Drop and Triage pinned under it, the empty card, the Review
 * items, and the More and Blocked by sheets.
 */
@Component({
  selector: 'asys-inbox-template',
  imports: [
    ActionBar,
    Button,
    LoadState,
    ReviewItem,
    RouterLink,
    Sheet,
    SyncNote,
    TaskBlockers,
    Text,
    TriageCard,
  ],
  templateUrl: './inbox-template.component.html',
  styleUrl: './inbox-template.css',
})
export class InboxTemplate {
  readonly #injector = inject(Injector);

  protected readonly TextStyle = TextStyle;

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly Icons = IconName;

  /** Whether the state has loaded. */
  readonly loaded = input.required<boolean>();

  /** Whether loading the state failed. */
  readonly loadFailed = input.required<boolean>();

  /** The status line under the heading. */
  readonly statusLine = input.required<string>();

  /** The open Review items. */
  readonly reviews = input.required<readonly InboxReview[]>();

  /** The Inbox Task on the card, or null. */
  readonly card = input.required<InboxCard | null>();

  /** The card's position, 1-based. */
  readonly position = input.required<number>();

  /** How many Tasks this visit's Triage covers. */
  readonly total = input.required<number>();

  /** The Areas to choose from. */
  readonly areas = input.required<readonly AreaChoice[]>();

  readonly today = input.required<LocalDate>();

  /** Whether the card's Task is being sent or waits for the server. */
  readonly cardBusy = input.required<boolean>();

  /** How often Triage was tapped while Importance or an Estimate was missing. */
  readonly attempts = input.required<number>();

  /** What Now would say once Importance and an Estimate are chosen. */
  readonly reason = input.required<TriageReason | null>();

  /** The Tasks triaged or dropped in this visit. */
  readonly handled = input.required<number>();

  /** Whether there is no Inbox Task and no Review item. */
  readonly empty = input.required<boolean>();

  /** The Tasks the card's Task waits for. */
  readonly blockedBy = input.required<readonly TaskBlockerRow[]>();

  /** The Tasks that wait for the card's Task. */
  readonly blocks = input.required<readonly TaskBlockerTask[]>();

  /** The Tasks offered as a blocker. */
  readonly candidates = input.required<readonly TaskBlockerTask[]>();

  /** The message of a failed Add or Remove. */
  readonly blockerMessage = input.required<string>();

  /** Whether an AddBlocker is in flight. */
  readonly blockerAdding = input.required<boolean>();

  /** Whether Add and Remove are unavailable. */
  readonly blockersBusy = input.required<boolean>();

  /** The Find a Task text. */
  readonly blockerFilter = model<string>('');

  /** The card's values. */
  readonly draft = model.required<TriageDraft>();

  /** Asks to load the state again. */
  readonly retry = output();

  /** Asks to dismiss the Review item with this id. */
  readonly dismiss = output<string>();

  /** Asks to triage the card's Task. */
  readonly triage = output();

  /** Asks to drop the card's Task. */
  readonly dropTask = output();

  /** Asks to open the card's Task in the editor. */
  readonly openEditor = output();

  /** Asks to make a Task a blocker of the card's Task; carries its Task id. */
  readonly addBlocker = output<string>();

  /** Asks to remove a blocker; carries the link id. */
  readonly removeBlocker = output<string>();

  private readonly heading = viewChild('heading', { read: ElementRef<HTMLElement> });

  private readonly triageCard = viewChild(TriageCard);

  private readonly taskBlockers = viewChild(TaskBlockers);

  private readonly reviewItems = viewChildren(ReviewItem);

  protected readonly moreOpen = signal(false);

  protected readonly blockersOpen = signal(false);

  protected readonly cards = computed<readonly InboxCard[]>(() => {
    const card = this.card();

    return card === null ? [] : [card];
  });

  protected readonly triageLabel = computed(() => {
    const reason = this.reason();

    return reason === null ? 'Triage' : `Triage as ${quadrantWord(reason.quadrant)}`;
  });

  protected readonly dismissActions = [{ label: 'Dismiss', kind: ReviewItemActionKind.Secondary }];

  /** Moves focus to the card, never its Title, or to the heading when there is no card. */
  focusCard(): void {
    const card = this.triageCard();

    if (card === undefined) {
      this.heading()?.nativeElement.focus();
    } else {
      card.focusCard();
    }
  }

  /** Moves focus to the Review item at this index, or to the heading when there is none. */
  focusReview(index: number): void {
    const next = this.reviewItems()[index];

    if (next === undefined) {
      this.heading()?.nativeElement.focus();
    } else {
      next.focus();
    }
  }

  /** Moves focus to the Remove button at this index in the Blocked by sheet, else the last one, else Find a Task. */
  focusBlockerRemove(index: number): void {
    this.taskBlockers()?.focusRemove(index);
  }

  /** Moves focus to the Find a Task field in the Blocked by sheet. */
  focusBlockerFilter(): void {
    this.taskBlockers()?.focusFilter();
  }

  protected chooseOpenEditor(): void {
    this.moreOpen.set(false);
    this.openEditor.emit();
  }

  protected chooseBlockedBy(): void {
    this.moreOpen.set(false);
    this.blockersOpen.set(true);
  }

  protected chooseDrop(): void {
    this.moreOpen.set(false);
    this.dropTask.emit();
  }

  /** The button in the More sheet that opened Blocked by is gone, so focus goes to the card's More button. */
  protected blockersOpenChange(open: boolean): void {
    if (!open) {
      afterNextRender(() => this.triageCard()?.focusMore(), { injector: this.#injector });
    }
  }
}
