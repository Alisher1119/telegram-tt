import type {GlobalState} from '../../global/types';
import type {SendMessageParams} from '../../types';
import type {DlpPolicy} from './dlp-policy.interface.ts';
import type {MessageInterface} from './message.interface.ts';

import {selectChat, selectUser} from '../../global/selectors';
import {omitUndefined} from '../../util/iteratees.ts';
import {ChatType, DLP_HEADERS} from './constants.ts';
import {currentTimeWithOffest, getActiveUsername} from './reducer.ts';
import {ApiMessage} from "../types";
import {getMainUsername, getUserFullName} from "../../global/helpers";

export class DLP {
  private static agentServer = 'http://localhost:3555';

  static async checkMessage(global: GlobalState, params: SendMessageParams): Promise<boolean> {
    console.log(global, params);

    try {
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
            ownerName: getUserFullName(owner),
            ownerPhone: owner.phoneNumber,
            ownerUsername: getActiveUsername(owner),

            chatId: chat.id,
            chatType: ChatType[chat.type],
            chatName: chat.title || getUserFullName(user),
            chatPhone: user?.phoneNumber,
            chatUsername: getActiveUsername(user),
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
    } catch (error) {
      console.error(error);
      return false;
    }
    return false;
  }

  static saveMessage(global: GlobalState, message: ApiMessage) {
    try {
      if (global.currentUserId) {
        const owner = selectUser(global, global.currentUserId);
        const chat = selectChat(global, message.chatId);

        if (owner && chat) {
          const chatType = ChatType[chat.type];
          const direction = message.isOutgoing ? 'out' : 'in';
          const isForwarding = Boolean(message?.forwardInfo);
          const user = selectUser(global, chat.id);
          let sender;

          const data: MessageInterface = {
            isForwarding,
            messageId: String(message.id),
            message: message.content?.text?.text || '',
            direction,
            dateTime: currentTimeWithOffest(message.date * 1000),

            ownerId: owner.id,
            ownerName: getUserFullName(owner),
            ownerPhone: owner.phoneNumber,
            ownerUsername: getActiveUsername(owner),

            chatId: chat.id,
            chatType,
            chatName: chat.title || getUserFullName(user),
            chatPhone: user?.phoneNumber,
            chatUsername: getActiveUsername(user),
          };

          if (chatType !== 'user' && message.senderId) {
            sender = selectChat(global, message.senderId);

            if (sender) {
              data.senderId = sender.id;
              data.senderName = getMainUsername(sender);
            } else {
              sender = selectUser(global, message.senderId);

              if (sender) {
                data.senderId = sender.id;
                data.senderName = getMainUsername(sender);
                data.senderUsername = getMainUsername(sender);
              }
            }
          }

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

          DLP.sendMessage(data).then((resp) => {
            console.log(resp);
          }).catch((err) => {
            console.error(err);
          });
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  static sendMessage(data: MessageInterface) {
    const body = new FormData();

    Object.entries(omitUndefined<MessageInterface>(data)).forEach(([key, value]) => {
      body.append(key, value);
    });

    return fetch(`${DLP.agentServer}/telegram`, {
      method: 'POST',
      headers: {...DLP_HEADERS},
      body,
    });
  }

  static async init(global: GlobalState): Promise<DlpPolicy> {
    return fetch(`${DLP.agentServer}/system`, {
      headers: {...DLP_HEADERS},
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
}
