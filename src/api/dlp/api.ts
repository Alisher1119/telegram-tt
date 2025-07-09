import type { GlobalState } from '../../global/types';
import type { SendMessageParams } from '../../types';
import type { DlpPolicy } from './dlp-policy.interface.ts';
import type { MessageInterface } from './message.interface.ts';

import { selectUser } from '../../global/selectors';
import { omitUndefined } from '../../util/iteratees.ts';
import { ChatType, DLP_HEADERS } from './constants.ts';
import { currentTimeWithOffest } from './reducer.ts';

export class DLP {
  private static agentServer = 'http://localhost:3555';

  static async checkMessage(global: GlobalState, params: SendMessageParams): Promise<boolean> {
    console.log(global, params);

    if (global.currentUserId) {
      const owner = selectUser(global, global.currentUserId);
      const chat = params.chat;

      if (owner && chat) {
        const user = selectUser(global, chat.id);

        const data: MessageInterface = {
          isForwarding: Boolean(params?.isForwarding),
          messageId: `f${new Date().getTime()}`,
          message: params?.text,
          direction: 'out',
          dateTime: currentTimeWithOffest(),

          ownerId: owner.id,
          ownerName: `${owner.firstName} ${owner.lastName}`.trim(),
          ownerPhone: owner.phoneNumber,
          ownerUsername: owner.usernames
            ?.filter(({ isActive }) => isActive)
            ?.at(1)?.username,

          chatId: chat.id,
          chatType: ChatType[chat.type],
          chatName: chat.title,
          chatPhone: user?.phoneNumber,
          chatUsername: user?.usernames
            ?.filter(({ isActive }) => isActive)
            ?.at(1)?.username,
        };

        if (params.attachment) {
          data.files = params.attachment.blob as File;
        }

        const fetchPromise = this.sendMessage(data);

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 3000));

        const resp: any = await Promise.race([fetchPromise, timeoutPromise]);

        if (!resp?.ok) {
          console.error('[DLP] Non-OK from leak detection (Telegram outgoing messages) server:', resp.status);
          return false;
        }

        const result = await resp.json();

        if (result.success) {
          if (result.block) {
            // window.TelegramMonitor.fMessageId = null;
          }
          console.log('[DLP] Telegram message result: ', result.message);
          return result.block;
        }
      }
    }
    return false;
  }

  static sendMessage(data: MessageInterface) {
    const body = new FormData();

    Object.entries(omitUndefined<MessageInterface>(data)).forEach(([key, value]) => {
      body.append(key, value);
    });

    return fetch(`${DLP.agentServer}/telegram`, {
      method: 'POST',
      headers: { ...DLP_HEADERS, 'Content-Type': 'multipart/form-data' },
      body,
    });
  }

  static async init(): Promise<DlpPolicy> {
    return fetch(`${DLP.agentServer}/system`, { headers: DLP_HEADERS })
      .then((res) => res.json())
      .catch((err) => {
        return {
          isBlockIfOffline: true,
          blockMessage: 'Передача заблокирована. Обратитесь к администратору.',
          telegram: true,
        };
      });
  }
}
