// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import {
  type AnimationCallbackEvent,
  Component,
  ElementRef,
  inject,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Quadrant } from '@asys/domain';

import { Button, ButtonVariant } from '../../atoms/button/button';
import { IconName } from '../../atoms/icon/icon';
import { SyncNote } from '../../atoms/sync-note/sync-note';
import { AreaPickControl, type AreaChoice } from '../../molecules/area-pick/area-pick';
import { LoadState } from '../../molecules/load-state/load-state';
import { PickerRow, PickerRowVariant } from '../../molecules/picker-row/picker-row';
import { LogProgressForm } from '../../organisms/log-progress-form/log-progress-form';
import { NowHeader } from '../../organisms/now-header/now-header';
import { SectionHeader } from '../../organisms/section-header/section-header';
import { SwipeActions } from '../../organisms/swipe-actions/swipe-actions';
import { TopPick } from '../../organisms/top-pick/top-pick';

/** The Task on the top pick card. */
export interface NowCard {
  readonly id: string;
  readonly title: string;
  /** The reason line. */
  readonly reason: string;
  readonly quadrant: Quadrant;
  readonly overdue: boolean;
  /** The Due fact that opens an Overdue reason, or null. */
  readonly dueFact: string | null;
  /** The Estimate as text, empty when there is none. */
  readonly estimate: string;
  /** The name of the Task's Area, or null. */
  readonly area: string | null;
  /** Whether the Task's title morphs into the Task editor. */
  readonly morph: boolean;
  readonly canLogProgress: boolean;
  /** Whether a Done or Log progress for the Task is pending or waits for the server. */
  readonly busy: boolean;
  readonly awaitingSync: boolean;
  /** The stored Estimate in minutes while the Log progress form shows, else null. */
  readonly formEstimate: number | null;
}

/** One ranked Task in the list under the card. */
export interface NowRow {
  readonly id: string;
  readonly title: string;
  readonly reason: string;
  readonly quadrant: Quadrant;
  readonly overdue: boolean;
  readonly estimate: string;
  readonly morph: boolean;
  readonly canLogProgress: boolean;
  readonly busy: boolean;
  /** The stored Estimate in minutes while the Log progress form shows, else null. */
  readonly formEstimate: number | null;
}

/** One Task in the Waiting section. */
export interface NowWaitingRow {
  readonly id: string;
  readonly title: string;
  readonly reason: string;
  readonly estimate: string;
  readonly overdue: boolean;
  readonly morph: boolean;
}

/** What the header's Current Area control shows. */
export interface NowAreaControl {
  readonly label: string;
  readonly pickedId: string | null;
  readonly automaticLabel: string;
  readonly areas: readonly AreaChoice[];
}

/** One Other Areas button. */
export interface NowOtherArea {
  readonly areaId: string;
  readonly text: string;
}

/** A Done asked from the card. */
export interface NowDone {
  readonly taskId: string;
  /** Whether the button was activated from the keyboard. */
  readonly keyboard: boolean;
}

/** A Done asked by a swipe. */
export interface NowSwipeDone {
  readonly taskId: string;
  /** Whether focus was inside the Task's row, which is not leaving, when the swipe committed. */
  readonly hadFocus: boolean;
}

/** A row that enters the list. */
export interface NowRowEnter {
  readonly event: AnimationCallbackEvent;
  readonly taskId: string;
}

/** Lays out Now: the header, the top pick with its actions, the ranked list, Other Areas and Waiting. */
@Component({
  selector: 'asys-now-template',
  imports: [
    AreaPickControl,
    Button,
    LoadState,
    LogProgressForm,
    NowHeader,
    PickerRow,
    RouterLink,
    SectionHeader,
    SwipeActions,
    SyncNote,
    TopPick,
  ],
  templateUrl: './now-template.component.html',
  styleUrl: './now-template.css',
})
export class NowTemplate {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly #document = inject(DOCUMENT);

  /** The moment in the Settings time zone, for the header. */
  readonly moment = input.required<string>();

  /** The moment as a machine-readable local date and time. */
  readonly datetime = input.required<string>();

  /** The Current Area control, or null while there is none. */
  readonly areaControl = input.required<NowAreaControl | null>();

  /** The status line under the heading. */
  readonly statusLine = input.required<string>();

  /** Whether the state has loaded. */
  readonly loaded = input.required<boolean>();

  /** Whether loading the state failed. */
  readonly loadFailed = input.required<boolean>();

  /** The card's Task, or null when none shows. */
  readonly card = input.required<NowCard | null>();

  /** Whether the card is leaving after a Done. */
  readonly leaving = input.required<boolean>();

  /** How many Tasks wait for Triage. */
  readonly inboxTaskCount = input.required<number>();

  /** The ranked Tasks under the card. */
  readonly rows = input.required<readonly NowRow[]>();

  /** The Other Areas line's buttons. */
  readonly otherAreas = input.required<readonly NowOtherArea[]>();

  /** The Tasks in the Waiting section. */
  readonly waiting = input.required<readonly NowWaitingRow[]>();

  /** The one fact the closed Waiting section shows, or null. */
  readonly waitingSummary = input.required<string | null>();

  /** Whether the Waiting section is open. */
  readonly waitingExpanded = model(false);

  /** Asks to load the state again. */
  readonly retry = output();

  /** Asks to pick the Area for the rest of its stretch, or Automatic with null. */
  readonly areaPicked = output<string | null>();

  /** Asks to pick the Area of an Other Areas button. */
  readonly otherAreaPicked = output<string>();

  /** Asks to mark the card's Task Done. */
  readonly done = output<NowDone>();

  /** Asks to mark a Task Done from a swipe. */
  readonly swipeDone = output<NowSwipeDone>();

  /** Asks to open the Log progress form for the Task with this id. */
  readonly logProgress = output<string>();

  /** Asks to save the logged progress, in minutes. */
  readonly saveProgress = output<number>();

  /** Asks to close the Log progress form. */
  readonly cancelForm = output();

  /** Reports whether focus is inside the Log progress form. */
  readonly formFocus = output<boolean>();

  /** A row is leaving the list. */
  readonly rowLeave = output<AnimationCallbackEvent>();

  /** A row is entering the list. */
  readonly rowEnter = output<NowRowEnter>();

  private readonly nowHeader = viewChild(NowHeader);

  private readonly areaPickControl = viewChild(AreaPickControl);

  private readonly topPick = viewChild(TopPick);

  private readonly topPickHost = viewChild<TopPick, ElementRef<HTMLElement>>(TopPick, {
    read: ElementRef,
  });

  protected readonly Variants = ButtonVariant;

  protected readonly Icons = IconName;

  protected readonly Rows = PickerRowVariant;

  /** Moves focus to the top pick's title link, or to the heading when no card shows. */
  focusTop(): void {
    const topPick = this.topPick();

    if (topPick === undefined) {
      this.nowHeader()?.focusHeading();
    } else {
      topPick.focusTitle();
    }
  }

  /** Moves focus to the card's Log progress button, when a card shows. */
  focusLogProgress(): void {
    this.topPick()?.focusLogProgress();
  }

  /** Moves focus to the Current Area control, when it shows. */
  focusAreaPick(): void {
    this.areaPickControl()?.focus();
  }

  /** Moves focus to the link of the Task's row or card, skipping one that is leaving; false when none shows. */
  focusTask(taskId: string): boolean {
    const title = Array.from(
      this.#host.nativeElement.querySelectorAll<HTMLElement>('[data-task-id]'),
    ).find(
      (element) =>
        element.getAttribute('data-task-id') === taskId &&
        element.closest('[data-leaving]') === null,
    );
    const link = title?.closest('a') ?? null;

    if (link === null) {
      return false;
    }
    link.focus();

    return true;
  }

  /** The card's `<article>`, the element that is animated, or null while no card shows. */
  cardElement(): HTMLElement | null {
    return this.topPickHost()?.nativeElement.querySelector<HTMLElement>('.asys-top-pick') ?? null;
  }

  /** Whether focus is inside the row, which is not leaving. */
  protected hadFocus(row: HTMLElement): boolean {
    const focused = this.#document.activeElement;

    return !row.hasAttribute('data-leaving') && focused !== null && row.contains(focused);
  }
}
