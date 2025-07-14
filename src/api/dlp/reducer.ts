import type { GlobalState } from '../../global/types';
import type { DlpPolicy } from './dlp-policy.interface.ts';
import type {ApiUser} from "../types";

export function currentTimeWithOffest(date: number | Date = new Date()): string {
  date = new Date(date);
  return new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds())).toISOString();
}

export function userFullName(user?: ApiUser) {
  return `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
}
export function getActiveUsername(user?: ApiUser) {
  return user?.usernames
    ?.filter(({ isActive }) => isActive)
    ?.at(0)?.username;
}

export function updateDlpPolicy<T extends GlobalState>(
  global: T,
  dlpPolicy: DlpPolicy,
): T {
  return {
    ...global,
    dlpPolicy,
  };
}
