export interface MessageInterface {
  // Message
  isForwarding: boolean;
  messageId: string;
  fMessageId?: string;
  dateTime: string;
  direction: 'in' | 'out';
  message?: string;

  // Owner
  ownerId: string;
  ownerUsername?: string;
  ownerName?: string;
  ownerPhone?: string;

  // Chat
  chatId: string;
  chatUsername?: string;
  chatName?: string;
  chatPhone?: string;
  chatType: 'group' | 'user' | 'megaGroup' | 'channel';

  // Sender
  senderId?: string;
  senderUsername?: string;
  senderName?: string;
  senderPhone?: string;

  // Source
  sourceId?: string;
  sourceUsername?: string;
  sourceName?: string;
  sourcePhone?: string;

  // Author
  authorId?: string;
  authorUsername?: string;
  authorName?: string;
  authorPhone?: string;

  // Files
  fileId?: string;
  files?: File;
}
