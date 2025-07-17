import type { GlobalState } from '../../global/types';
import type { ForwardMessagesParams, SendMessageParams } from '../../types';
import type { ApiMessage } from '../types';
import type { DlpPolicy } from './dlp-policy.interface.ts';
import type { MessageInterface } from './message.interface.ts';
import { ApiMediaFormat } from '../types';

import { getMediaFilename, getMediaHash, getMessageDownloadableMedia, getUserFullName } from '../../global/helpers';
import { selectChat, selectUser } from '../../global/selectors';
import { omitUndefined } from '../../util/iteratees.ts';
import { fetchFromCacheOrRemote } from '../../util/mediaLoader.ts';
import { ChatType, DLP_HEADERS } from './constants.ts';
import { currentTimeWithOffest, getActiveUsername } from './reducer.ts';

export class DLP {
  private static agentServer = 'http://localhost:3555';

  static async checkMessage(global: GlobalState, params: SendMessageParams): Promise<boolean> {
    try {
      if (global.currentUserId) {
        const owner = DLP.getOwnerData(global);
        const chat = DLP.getChatData(global, params.chat?.id);

        if (owner && chat) {
          const data: MessageInterface = {
            isForwarding: Boolean(params?.isForwarding),
            messageId: `f${new Date().getTime()}`,
            message: params?.text,
            direction: 'out',
            dateTime: currentTimeWithOffest(),

            ...owner,
            ...chat,
          };

          if (params.attachment) {
            data.files = params.attachment.blob as File;
          }

          return await this.sendMessage(data);
        }
      }
    } catch (error) {
      return false;
    }
    return false;
  }

  static async checkForwardedMessages(global: GlobalState, params: ForwardMessagesParams): Promise<boolean> {
    try {
      if (global.currentUserId) {
        const owner = DLP.getOwnerData(global);
        const chat = DLP.getChatData(global, params.toChat.id);

        const source = selectChat(global, params.fromChat.id);
        const sourceUser = selectUser(global, params.fromChat.id);
        const queries: Promise<boolean>[] = [];
        if (owner && chat && source) {
          const sourceChatType = ChatType[source?.type];
          for (const message of params.messages) {
            const data: MessageInterface = {
              isForwarding: true,
              messageId: `f${new Date().getTime()}`,
              message: message.content?.text?.text || '',
              direction: 'out',
              dateTime: currentTimeWithOffest(),

              ...owner,
              ...chat,

              sourceId: source.id,
              sourceName: source.title || getUserFullName(sourceUser),
              sourcePhone: sourceUser?.phoneNumber,
              sourceUsername: getActiveUsername(sourceUser),
            };

            if (message.forwardInfo?.fromChatId && message.forwardInfo?.fromId) {
              const author = selectUser(global, message.forwardInfo.fromId);

              if (sourceChatType === 'user' && author) {
                data.sourceName = getUserFullName(author);
                data.senderPhone = author.phoneNumber;
              }

              if (author) {
                data.authorId = author.id;
                data.authorName = getUserFullName(author);
                data.authorUsername = getActiveUsername(author);
                data.authorPhone = author.phoneNumber;
              }
            }

            const media = getMessageDownloadableMedia(message);
            if (media) {
              const mediaHash = getMediaHash(media, 'download');
              if (mediaHash) {
                const arrayBuffer = await fetchFromCacheOrRemote(
                  mediaHash,
                  ApiMediaFormat.DownloadUrl,
                  false,
                ) as unknown as ArrayBuffer;
                data.files = new File([arrayBuffer], getMediaFilename(media));
              }
            }
            queries.push(DLP.sendMessage(data));
          }

          return (await Promise.all(queries)).some(Boolean);
        }
      }
    } catch (error) {
      return false;
    }
    return false;
  }

  static async saveMessage(global: GlobalState, message: ApiMessage): Promise<boolean> {
    try {
      if (global.currentUserId) {
        const owner = DLP.getOwnerData(global);
        const chat = DLP.getChatData(global, message.chatId);

        if (owner && chat) {
          const chatType = chat.chatType;
          const direction = message.isOutgoing ? 'out' : 'in';
          const isForwarding = Boolean(message?.forwardInfo);

          const data: MessageInterface = {
            isForwarding,
            messageId: String(message.id),
            message: message.content?.text?.text || '',
            direction,
            dateTime: currentTimeWithOffest(message.date * 1000),

            ...owner,
            ...chat,
          };

          if (message.forwardInfo?.fromChatId && message.forwardInfo?.fromId) {
            const source = selectChat(global, message.forwardInfo.fromChatId);
            const author = selectUser(global, message.forwardInfo.fromId);

            if (source) {
              data.sourceId = source.id;
              data.sourceName = source.title;

              if (chatType === 'user' && author) {
                data.sourceName = getUserFullName(author);
                data.senderPhone = author.phoneNumber;
              }
            }

            if (author) {
              data.authorId = author.id;
              data.authorName = getUserFullName(author);
              data.authorUsername = getActiveUsername(author);
              data.authorPhone = author.phoneNumber;
            }
          }

          return await this.sendMessage(data);
        }
      }
    } catch (error) {
      return false;
    }
    return false;
  }

  static async sendMessage(data: MessageInterface) {
    const body = new FormData();

    Object.entries(omitUndefined<MessageInterface>(data)).forEach(([key, value]) => {
      body.append(key, value);
    });

    const fetchPromise = fetch(`${DLP.agentServer}/telegram`, {
      method: 'POST',
      headers: { ...DLP_HEADERS },
      body,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), 3000));

    const resp: any = await Promise.race([fetchPromise, timeoutPromise]);

    if (!resp?.ok) {
      return false;
    }

    const result = await resp.json();

    if (result.success) {
      return result.block;
    }
  }

  static async init(global: GlobalState): Promise<DlpPolicy> {
    return fetch(`${DLP.agentServer}/system`, {
      headers: { ...DLP_HEADERS },
    })
      .then((res) => res.json())
      .catch((err) => {
        return global?.dlpPolicy || {
          isBlockIfOffline: true,
          blockMessage: 'Передача заблокирована. Обратитесь к администратору.',
          telegram: true,
        };
      });
  }

  static getOwnerData(global: GlobalState) {
    if (!global.currentUserId) {
      return;
    }

    const owner = selectUser(global, global.currentUserId);

    if (!owner) {
      return;
    }
    return {
      ownerId: owner.id,
      ownerName: getUserFullName(owner),
      ownerPhone: owner.phoneNumber,
      ownerUsername: getActiveUsername(owner),
    };
  }

  static getChatData(global: GlobalState, chatId?: string) {
    if (!chatId) {
      return;
    }

    const chat = selectChat(global, chatId);
    const user = selectUser(global, chatId);

    if (!chat) {
      return;
    }
    return {
      chatId: chat.id,
      chatType: ChatType[chat.type],
      chatName: chat.title || getUserFullName(user),
      chatPhone: user?.phoneNumber,
      chatUsername: getActiveUsername(user),
    };
  }
}
