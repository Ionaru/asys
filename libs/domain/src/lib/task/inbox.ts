// SPDX-License-Identifier: MPL-2.0

import { TaskStatus, type Task } from './task';

export const isInInbox = (task: Task): boolean => {
  return (
    task.status === TaskStatus.Open && (task.important === null || task.estimateMinutes === null)
  );
};
