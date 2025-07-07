import type { GlobalState } from '../../global/types';
import type { DlpPolicy } from './dlp-policy.interface.ts';

export function updateDlpPolicy<T extends GlobalState>(
  global: T,
  dlpPolicy: DlpPolicy,
): T {
  return {
    ...global,
    dlpPolicy,
  };
}
