// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, ViewEncapsulation } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBan,
  faBarProgressHalf,
  faBullseye,
  faCalendarDay,
  faCheck,
  faChevronDown,
  faChevronRight,
  faCircleExclamation,
  faCircleQuestion,
  faCloudArrowUp,
  faEllipsis,
  faFolder,
  faForward,
  faHourglassHalf,
  faInbox,
  faPlus,
  faRotateRight,
  faStopwatch,
  faTriangleExclamation,
  faUser,
  faXmark,
} from '@fortawesome/pro-regular-svg-icons';
import {
  faBullseye as faBullseyeSolid,
  faCalendarDay as faCalendarDaySolid,
  faInbox as faInboxSolid,
} from '@fortawesome/pro-solid-svg-icons';

/** The icons the PWA draws, by their Font Awesome names. One meaning, one icon (the design system's Icon table). */
export enum IconName {
  Check = 'check',
  Stopwatch = 'stopwatch',
  BarProgressHalf = 'bar-progress-half',
  Folder = 'folder',
  CircleExclamation = 'circle-exclamation',
  TriangleExclamation = 'triangle-exclamation',
  CircleQuestion = 'circle-question',
  HourglassHalf = 'hourglass-half',
  ChevronRight = 'chevron-right',
  ChevronDown = 'chevron-down',
  Ellipsis = 'ellipsis',
  Plus = 'plus',
  Xmark = 'xmark',
  RotateRight = 'rotate-right',
  Bullseye = 'bullseye',
  CalendarDay = 'calendar-day',
  Inbox = 'inbox',
  Ban = 'ban',
  User = 'user',
  Forward = 'forward',
  CloudArrowUp = 'cloud-arrow-up',
}

/** Classic Regular, the design system's one style. */
export const REGULAR_ICONS: Readonly<Record<IconName, IconDefinition>> = {
  [IconName.Check]: faCheck,
  [IconName.Stopwatch]: faStopwatch,
  [IconName.BarProgressHalf]: faBarProgressHalf,
  [IconName.Folder]: faFolder,
  [IconName.CircleExclamation]: faCircleExclamation,
  [IconName.TriangleExclamation]: faTriangleExclamation,
  [IconName.CircleQuestion]: faCircleQuestion,
  [IconName.HourglassHalf]: faHourglassHalf,
  [IconName.ChevronRight]: faChevronRight,
  [IconName.ChevronDown]: faChevronDown,
  [IconName.Ellipsis]: faEllipsis,
  [IconName.Plus]: faPlus,
  [IconName.Xmark]: faXmark,
  [IconName.RotateRight]: faRotateRight,
  [IconName.Bullseye]: faBullseye,
  [IconName.CalendarDay]: faCalendarDay,
  [IconName.Inbox]: faInbox,
  [IconName.Ban]: faBan,
  [IconName.User]: faUser,
  [IconName.Forward]: faForward,
  [IconName.CloudArrowUp]: faCloudArrowUp,
};

/** Classic Solid, only for the current tab in the bottom navigation. */
export const SOLID_ICONS: Readonly<Partial<Record<IconName, IconDefinition>>> = {
  [IconName.Bullseye]: faBullseyeSolid,
  [IconName.CalendarDay]: faCalendarDaySolid,
  [IconName.Inbox]: faInboxSolid,
};

/**
 * One Font Awesome Pro glyph, 1em tall and 1.25em wide, in the colour of the text it marks. Always hidden
 * from screen readers: say a meaning the words leave out in visually hidden text. The only place the PWA
 * imports Font Awesome.
 */
@Component({
  selector: 'asys-icon',
  imports: [FaIconComponent],
  template: '<fa-icon [icon]="definition()" />',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-icon',
    'aria-hidden': 'true',
    '[class.asys-icon--lg]': 'large()',
  },
  styles: `
    /* The svg is the only box, so it lines up in text and in flex rows alike. */
    .asys-icon,
    .asys-icon > fa-icon {
      display: contents;
    }

    .asys-icon svg {
      flex: none;
    }

    .asys-icon--lg {
      font-size: 1.25em;
    }

    .asys-icon--lg svg {
      vertical-align: -0.2em;
    }

    @media (forced-colors: active) {
      .asys-icon svg {
        forced-color-adjust: none;
        color: CanvasText;
      }
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();

  /** Draws the Solid glyph where one exists (the current tab); otherwise Regular. */
  readonly solid = input<boolean>(false);

  /** A quarter larger than the text. */
  readonly large = input<boolean>(false);

  protected readonly definition = computed(
    () => (this.solid() ? SOLID_ICONS[this.name()] : undefined) ?? REGULAR_ICONS[this.name()],
  );
}
