export interface DlpPolicy {
  isBlockIfOffline: boolean;
  blockMessage?: string;
  telegram?: boolean;
  whatsapp?: boolean;
}
