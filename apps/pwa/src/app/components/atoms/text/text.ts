// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';

/** The type styles of the design system, by role. */
export enum TextStyle {
  Display = 'display',
  Title = 'title',
  Heading = 'heading',
  BodyStrong = 'body-strong',
  Body = 'body',
  Reason = 'reason',
  Label = 'label',
  Time = 'time',
  TimeLarge = 'time-large',
}

/**
 * Text that stands on its own: an empty state, a note, a message or a heading. Put it on a `p`, `h1` to `h3` or
 * `span`; the element keeps its tag, and its own class keeps only margin and colour.
 */
@Component({
  selector: '[asys-text]',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-text',
    '[class.asys-text--display]': 'textStyle() === Style.Display',
    '[class.asys-text--title]': 'textStyle() === Style.Title',
    '[class.asys-text--heading]': 'textStyle() === Style.Heading',
    '[class.asys-text--body-strong]': 'textStyle() === Style.BodyStrong',
    '[class.asys-text--body]': 'textStyle() === Style.Body',
    '[class.asys-text--reason]': 'textStyle() === Style.Reason',
    '[class.asys-text--label]': 'textStyle() === Style.Label',
    '[class.asys-text--time]': 'textStyle() === Style.Time',
    '[class.asys-text--time-large]': 'textStyle() === Style.TimeLarge',
    '[class.asys-text--muted]': 'muted()',
  },
  template: '<ng-content />',
  styleUrl: './text.css',
})
export class Text {
  protected readonly Style = TextStyle;

  readonly textStyle = input<TextStyle>(TextStyle.Body);

  /** The muted ink colour on any style. */
  readonly muted = input<boolean>(false);
}
