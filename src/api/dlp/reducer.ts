import type { GlobalState } from '../../global/types';
import type { DlpPolicy } from './dlp-policy.interface.ts';

export function currentTimeWithOffest(): string {
  const date = new Date();
  return new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds())).toISOString();
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
