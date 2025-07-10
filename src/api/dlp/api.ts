import type {GlobalState} from '../../global/types';
import type {SendMessageParams} from '../../types';
import type {DlpPolicy} from './dlp-policy.interface.ts';
import type {MessageInterface} from './message.interface.ts';

import {selectUser} from '../../global/selectors';
import {omitUndefined} from '../../util/iteratees.ts';
import {ChatType, DLP_HEADERS} from './constants.ts';
import {currentTimeWithOffest} from './reducer.ts';

export class DLP {
  private static agentServer = 'http://localhost:3555';
  private static server = 'https://192.168.100.127:3501';
  private static serverToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRJZCI6IjY4NmY5ZDBmZTQzMmNmYmI0YWVmN2NlNCIsImNvbXB1dGVySWQiOiI2ODZmOWQwZmU0MzJjZmJiNGFlZjdjZGYiLCJydWxlIjoiNjQ4OTlmZGE0MjhmYjY0ODM0NTYxZjYyIiwiYWdlbnRWZXJzaW9uIjoyLCJwY0lkIjoiOUI3NzY3MEYzNkUyQ0EzRTFEODc2QzE2NDQ5M0IwRTAiLCJpYXQiOjE3NTIxNDUxNjd9.lG_ze4SD5xlgzA0p1MCyjJaKK0Te76vmydfQF7wEqHE';

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
          ownerName: `${owner.firstName || ''} ${owner.lastName || ''}`.trim(),
          ownerPhone: owner.phoneNumber,
          ownerUsername: owner.usernames
            ?.filter(({isActive}) => isActive)
            ?.at(0)?.username,

          chatId: chat.id,
          chatType: ChatType[chat.type],
          chatName: chat.title,
          chatPhone: user?.phoneNumber,
          chatUsername: user?.usernames
            ?.filter(({isActive}) => isActive)
            ?.at(0)?.username,
        };

        if (params.attachment) {
          data.files = params.attachment.blob as File;
        }

        console.log(data);

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

    return fetch(`${DLP.server}/api/client/data/telegram`, {
      method: 'POST',
      headers: {
        Authorization: DLP.serverToken,
      },
      body,
    });
  }

  static async init(): Promise<DlpPolicy> {
    return fetch(`${DLP.server}/api/client/config`, {
      headers: {
        Authorization: DLP.serverToken,
      },
    })
      .then((res) => JSON.stringify({
        isBlockIfOffline: true,
        blockMessage: 'Передача заблокирована. Обратитесь к администратору.',
        telegram: true,
      }))
      .catch((err) => {
        return {
          isBlockIfOffline: true,
          blockMessage: 'Передача заблокирована. Обратитесь к администратору.',
          telegram: true,
        };
      });
  }
}
