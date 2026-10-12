// SPDX-License-Identifier: MPL-2.0

import { Privacy } from '../task/task';
import { PERSONAL_ACTIVE_HOURS, WORK_ACTIVE_HOURS, type ActiveHours } from './active-hours';
import { Palette } from './palette';

export interface Area {
  readonly id: string;
  readonly name: string;
  readonly activeHours: ActiveHours;
  readonly defaultPrivacy: Privacy | null;
  readonly palette: Palette | null;
  readonly version: number;
}

export const seedAreas = (ids: {
  readonly workId: string;
  readonly personalId: string;
}): readonly [Area, Area] => {
  return [
    {
      id: ids.workId,
      name: 'Work',
      activeHours: WORK_ACTIVE_HOURS,
      defaultPrivacy: null,
      palette: null,
      version: 1,
    },
    {
      id: ids.personalId,
      name: 'Personal',
      activeHours: PERSONAL_ACTIVE_HOURS,
      defaultPrivacy: Privacy.Hidden,
      palette: Palette.Harbour,
      version: 1,
    },
  ];
};
