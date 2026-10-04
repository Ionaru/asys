// SPDX-License-Identifier: EUPL-1.2

/** What the share target prefills: one title line and the whole shared text. */
export interface SharedCapture {
  readonly title: string;
  readonly captureText: string;
}

const lines = (value: string | undefined): readonly string[] =>
  (value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** The capture a share produces, or null when nothing was shared. */
export const sharedCapture = (params: {
  readonly title?: string;
  readonly text?: string;
  readonly url?: string;
}): SharedCapture | null => {
  const url = params.url?.trim() ?? '';
  const urlPart = url !== '' && !(params.text ?? '').includes(url) ? [url] : [];
  const all = [...lines(params.title), ...lines(params.text), ...urlPart];

  if (all.length === 0) {
    return null;
  }

  return { title: all[0], captureText: all.join('\n') };
};
