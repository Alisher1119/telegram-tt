import type { GlobalState } from '../../global/types';
import type { SendMessageParams } from '../../types';
import type { DlpPolicy } from './dlp-policy.interface.ts';
import type { MessageInterface } from './message.interface.ts';

import { selectUser } from '../../global/selectors';
import { ChatType, DLP_HEADERS } from './constants.ts';
import { currentTimeWithOffest } from './reducer.ts';

export class DLP {
  private static agentServer = 'http://localhost:3555';

  static async checkMessage(global: GlobalState, params: SendMessageParams): Promise<boolean> {
    console.log(global, params);

    return new Promise<boolean>((resolve) => {
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
            data.files = [params.attachment.blob as File];
          }

          console.log(data);
        } else {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    });
  }

  static sendMessage() {

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
