// SPDX-License-Identifier: EUPL-1.2
import { Motion, MotionDuration, MotionEasing } from '../core/platform/motion';

/** The visible part of the page: the visual viewport's offset and size. */
export interface ViewportBox {
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly width: number;
  readonly height: number;
}

/** Whether the tab has a non-zero area and lies wholly inside the viewport box. */
export const tabInView = (tab: DOMRectReadOnly, viewport: ViewportBox): boolean =>
  tab.width > 0 &&
  tab.height > 0 &&
  tab.left >= viewport.offsetLeft &&
  tab.top >= viewport.offsetTop &&
  tab.right <= viewport.offsetLeft + viewport.width &&
  tab.bottom <= viewport.offsetTop + viewport.height;

/**
 * Flies a ghost carrying the captured text from `from` to the centre of `to`, shrinking and fading out.
 * The flight is decoration: the ghost is removed afterwards, also when the animation fails.
 */
export const flyCapture = async (
  doc: Document,
  motion: Motion,
  from: DOMRectReadOnly,
  to: DOMRectReadOnly,
  text: string,
): Promise<void> => {
  const ghost = doc.createElement('span');

  ghost.className = 'shell__ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = text;
  ghost.style.position = 'fixed';
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  ghost.style.width = `${from.width}px`;
  ghost.style.height = `${from.height}px`;
  ghost.style.pointerEvents = 'none';
  doc.body.appendChild(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  try {
    await motion.play(
      ghost,
      [
        { translate: '0 0', scale: '1', opacity: 1 },
        { opacity: 1, offset: 2 / 3 },
        { translate: `${dx}px ${dy}px`, scale: '0.2', opacity: 0 },
      ],
      { duration: MotionDuration.Moderate, easing: MotionEasing.Emphasized },
    );
  } finally {
    ghost.remove();
  }
};
