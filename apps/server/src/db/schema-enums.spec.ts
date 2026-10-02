// SPDX-License-Identifier: EUPL-1.2
import { ChangeEntity, ChangeOp, Privacy, TaskKind, TaskStatus, Voice } from '@asys/domain';
import { describe, expect, it } from 'vitest';
import { changeEntity, changeOp, privacy, taskKind, taskStatus, voice } from './schema';

// schema.ts cannot import the domain enums at runtime (drizzle-kit's loader
// cannot resolve the path alias), so these tests keep the two copies equal.

describe('database enums match the domain enums', () => {
  it.each([
    ['taskKind', taskKind.enumValues, Object.values(TaskKind)],
    ['taskStatus', taskStatus.enumValues, Object.values(TaskStatus)],
    ['voice', voice.enumValues, Object.values(Voice)],
    ['privacy', privacy.enumValues, Object.values(Privacy)],
    ['changeEntity', changeEntity.enumValues, Object.values(ChangeEntity)],
    ['changeOp', changeOp.enumValues, Object.values(ChangeOp)],
  ])('%s has the values of its domain enum, in order', (_name, actual, expected) => {
    expect([...actual]).toEqual(expected);
  });
});
