import type { ElementRef, FC } from '@teact';
import { getIsHeavyAnimating, memo } from '@teact';
import { getActions, getGlobal } from '../../global';

import type { ApiMessage } from '../../api/types';
import type { IAlbum, MessageListType, ThreadId } from '../../types';
import type { Signal } from '../../util/signals';
import type { MessageDateGroup } from './helpers/groupMessages';
import type { OnIntersectPinnedMessage } from './hooks/usePinnedMessage';
import { MAIN_THREAD_ID } from '../../api/types';

import { SCHEDULED_WHEN_ONLINE } from '../../config';
import {
  getMessageHtmlId,
  getMessageOriginalId,
  isActionMessage,
  isOwnMessage,
  isServiceNotificationMessage,
} from '../../global/helpers';
import { getPeerTitle } from '../../global/helpers/peers';
import { selectSender } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import { formatHumanDate } from '../../util/dates/dateFormat';
import { compact } from '../../util/iteratees';
import { formatStarsAsText } from '../../util/localization/format';
import { isAlbum } from './helpers/groupMessages';
import { preventMessageInputBlur } from './helpers/preventMessageInputBlur';

import useDerivedSignal from '../../hooks/useDerivedSignal';
import useLang from '../../hooks/useLang';
import useOldLang from '../../hooks/useOldLang';
import usePreviousDeprecated from '../../hooks/usePreviousDeprecated';
import useMessageObservers from './hooks/useMessageObservers';
import useScrollHooks from './hooks/useScrollHooks';

import ActionMessage from './message/ActionMessage';
import Message from './message/Message';
import SenderGroupContainer from './message/SenderGroupContainer';
import SponsoredMessage from './message/SponsoredMessage';
import MessageListAccountInfo from './MessageListAccountInfo';

interface OwnProps {
  canShowAds?: boolean;
  chatId: string;
  threadId: ThreadId;
  messageIds: number[];
  messageGroups: MessageDateGroup[];
  getContainerHeight: Signal<number | undefined>;
  isViewportNewest: boolean;
  isUnread: boolean;
  withUsers: boolean;
  isChannelChat: boolean | undefined;
  isChatMonoforum?: boolean;
  isEmptyThread?: boolean;
  isComments?: boolean;
  noAvatars: boolean;
  containerRef: ElementRef<HTMLDivElement>;
  anchorIdRef: { current: string | undefined };
  memoUnreadDividerBeforeIdRef: { current: number | undefined };
  memoFirstUnreadIdRef: { current: number | undefined };
  type: MessageListType;
  isReady: boolean;
  hasLinkedChat: boolean | undefined;
  isSchedule: boolean;
  shouldRenderAccountInfo?: boolean;
  nameChangeDate?: number;
  photoChangeDate?: number;
  noAppearanceAnimation: boolean;
  isSavedDialog?: boolean;
  onScrollDownToggle: BooleanToVoidFunction;
  onNotchToggle: AnyToVoidFunction;
  onIntersectPinnedMessage: OnIntersectPinnedMessage;
  canPost?: boolean;
}

const UNREAD_DIVIDER_CLASS = 'unread-divider';

const MessageListContent: FC<OwnProps> = ({
  canShowAds,
  chatId,
  threadId,
  messageIds,
  messageGroups,
  getContainerHeight,
  isViewportNewest,
  isUnread,
  isComments,
  isEmptyThread,
  withUsers,
  isChannelChat,
  isChatMonoforum,
  noAvatars,
  containerRef,
  anchorIdRef,
  memoUnreadDividerBeforeIdRef,
  memoFirstUnreadIdRef,
  type,
  isReady,
  hasLinkedChat,
  isSchedule,
  shouldRenderAccountInfo,
  nameChangeDate,
  photoChangeDate,
  noAppearanceAnimation,
  isSavedDialog,
  onScrollDownToggle,
  onNotchToggle,
  onIntersectPinnedMessage,
  canPost,
}) => {
  const { openHistoryCalendar } = getActions();

  const getIsHeavyAnimating2 = getIsHeavyAnimating;
  const getIsReady = useDerivedSignal(() => isReady && !getIsHeavyAnimating2(), [isReady, getIsHeavyAnimating2]);

  const areDatesClickable = !isSavedDialog && !isSchedule;

  const {
    observeIntersectionForReading,
    observeIntersectionForLoading,
    observeIntersectionForPlaying,
  } = useMessageObservers(type, containerRef, memoFirstUnreadIdRef, onIntersectPinnedMessage, chatId);

  const {
    withHistoryTriggers,
    backwardsTriggerRef,
    forwardsTriggerRef,
    fabTriggerRef,
  } = useScrollHooks(
    type,
    containerRef,
    messageIds,
    getContainerHeight,
    isViewportNewest,
    isUnread,
    onScrollDownToggle,
    onNotchToggle,
    isReady,
  );

  const oldLang = useOldLang();
  const lang = useLang();

  const unreadDivider = (
    <div className={buildClassName(UNREAD_DIVIDER_CLASS, 'local-action-message')} key="unread-messages">
      <span>{oldLang('UnreadMessages')}</span>
    </div>
  );
  const renderPaidMessageAction = (message: ApiMessage, album?: IAlbum) => {
    if (message.paidMessageStars) {
      const messagesLength = album?.messages?.length || 1;
      const amount = message.paidMessageStars * messagesLength;
      return (
        <div
          className={buildClassName('local-action-message')}
          key={`paid-messages-action-${message.id}`}
        >
          <span>
            {
              message.isOutgoing
                ? lang('ActionPaidOneMessageOutgoing', {
                  amount: formatStarsAsText(lang, amount),
                })
                : (() => {
                  const sender = selectSender(getGlobal(), message);
                  const userTitle = sender ? getPeerTitle(lang, sender) : '';
                  return lang('ActionPaidOneMessageIncoming', {
                    user: userTitle,
                    amount: formatStarsAsText(lang, amount),
                  });
                })()
            }
          </span>
        </div>
      );
    }
    return undefined;
  };
  const messageCountToAnimate = noAppearanceAnimation ? 0 : messageGroups.reduce((acc, messageGroup) => {
    return acc + messageGroup.senderGroups.flat().length;
  }, 0);
  let appearanceIndex = 0;

  const prevMessageIds = usePreviousDeprecated(messageIds);
  const isNewMessage = Boolean(
    messageIds && prevMessageIds && messageIds[messageIds.length - 2] === prevMessageIds[prevMessageIds.length - 1],
  );

  function calculateSenderGroups(
    dateGroup: MessageDateGroup, dateGroupIndex: number, dateGroupsArray: MessageDateGroup[],
  ) {
    return dateGroup.senderGroups.map((
      senderGroup,
      senderGroupIndex,
      senderGroupsArray,
    ) => {
      if (
        senderGroup.length === 1
        && !isAlbum(senderGroup[0])
        && isActionMessage(senderGroup[0])
        && senderGroup[0].content.action?.type !== 'phoneCall'
      ) {
        const message = senderGroup[0];
        const isLastInList = (
          senderGroupIndex === senderGroupsArray.length - 1
          && dateGroupIndex === dateGroupsArray.length - 1
        );

        return compact([
          message.id === memoUnreadDividerBeforeIdRef.current && unreadDivider,
          <ActionMessage
            key={message.id}
            message={message}
            threadId={threadId}
            observeIntersectionForBottom={observeIntersectionForReading}
            observeIntersectionForLoading={observeIntersectionForLoading}
            observeIntersectionForPlaying={observeIntersectionForPlaying}
            memoFirstUnreadIdRef={memoFirstUnreadIdRef}
            appearanceOrder={messageCountToAnimate - ++appearanceIndex}
            isJustAdded={isLastInList && isNewMessage}
            isLastInList={isLastInList}
            getIsMessageListReady={getIsReady}
            onIntersectPinnedMessage={onIntersectPinnedMessage}
          />,
        ]);
      }

      let currentDocumentGroupId: string | undefined;

      const senderGroupElements = senderGroup.map((
        messageOrAlbum,
        messageIndex,
      ) => {
        const message = isAlbum(messageOrAlbum) ? messageOrAlbum.mainMessage : messageOrAlbum;
        const album = isAlbum(messageOrAlbum) ? messageOrAlbum : undefined;
        const isOwn = isOwnMessage(message);
        const isMessageAlbum = isAlbum(messageOrAlbum);
        const nextMessage = senderGroup[messageIndex + 1];

        if (message.previousLocalId && anchorIdRef.current === getMessageHtmlId(message.previousLocalId)) {
          anchorIdRef.current = getMessageHtmlId(message.id);
        }

        const documentGroupId = !isMessageAlbum && message.groupedId ? message.groupedId : undefined;
        const nextDocumentGroupId = nextMessage && !isAlbum(nextMessage) ? nextMessage.groupedId : undefined;
        const isTopicTopMessage = message.id === threadId;

        const position = {
          isFirstInGroup: messageIndex === 0,
          isLastInGroup: messageIndex === senderGroup.length - 1,
          isFirstInDocumentGroup: Boolean(documentGroupId && documentGroupId !== currentDocumentGroupId),
          isLastInDocumentGroup: Boolean(documentGroupId && documentGroupId !== nextDocumentGroupId),
          isLastInList: (
            messageIndex === senderGroup.length - 1
            && senderGroupIndex === senderGroupsArray.length - 1
            && dateGroupIndex === dateGroupsArray.length - 1
          ),
        };

        currentDocumentGroupId = documentGroupId;

        const originalId = getMessageOriginalId(message);
        // Service notifications saved in cache in previous versions may share the same `previousLocalId`
        const key = isServiceNotificationMessage(message) ? `${message.date}_${originalId}` : originalId;

        const noComments = hasLinkedChat === false || !isChannelChat || Boolean(isChatMonoforum);

        return compact([
          message.id === memoUnreadDividerBeforeIdRef.current && unreadDivider,
          message.paidMessageStars && !withUsers && renderPaidMessageAction(message, album),
          <Message
            key={key}
            message={message}
            observeIntersectionForBottom={observeIntersectionForReading}
            observeIntersectionForLoading={observeIntersectionForLoading}
            observeIntersectionForPlaying={observeIntersectionForPlaying}
            album={album}
            noAvatars={noAvatars}
            withAvatar={position.isLastInGroup && withUsers && !isOwn && (!isTopicTopMessage || !isComments)}
            withSenderName={position.isFirstInGroup && withUsers && !isOwn}
            threadId={threadId}
            messageListType={type}
            noComments={noComments}
            noReplies={!noComments || threadId !== MAIN_THREAD_ID || type === 'scheduled'}
            appearanceOrder={messageCountToAnimate - ++appearanceIndex}
            isJustAdded={position.isLastInList && isNewMessage}
            isFirstInGroup={position.isFirstInGroup}
            isLastInGroup={position.isLastInGroup}
            isFirstInDocumentGroup={position.isFirstInDocumentGroup}
            isLastInDocumentGroup={position.isLastInDocumentGroup}
            isLastInList={position.isLastInList}
            memoFirstUnreadIdRef={memoFirstUnreadIdRef}
            onIntersectPinnedMessage={onIntersectPinnedMessage}
            getIsMessageListReady={getIsReady}
          />,
          message.id === threadId && (
            // eslint-disable-next-line react-x/no-duplicate-key
            <div className="local-action-message" key="discussion-started">
              <span>
                {oldLang(isEmptyThread
                  ? (isComments ? 'NoComments' : 'NoReplies') : 'DiscussionStarted')}
              </span>
            </div>
          ),
        ]);
      }).flat();

      if (!withUsers) return senderGroupElements;

      const lastMessageOrAlbum = senderGroup[senderGroup.length - 1];
      const lastMessage = isAlbum(lastMessageOrAlbum) ? lastMessageOrAlbum.mainMessage : lastMessageOrAlbum;
      const lastMessageId = getMessageOriginalId(lastMessage);
      const lastAppearanceOrder = messageCountToAnimate - appearanceIndex;

      const isTopicTopMessage = lastMessage.id === threadId;
      const isOwn = isOwnMessage(lastMessage);

      const firstMessageOrAlbum = senderGroup[0];
      const firstMessage = isAlbum(firstMessageOrAlbum) ? firstMessageOrAlbum.mainMessage : firstMessageOrAlbum;
      const firstMessageId = getMessageOriginalId(firstMessage);

      const key = `${firstMessageId}-${lastMessageId}`;
      const id = (firstMessageId === lastMessageId) ? `message-group-${firstMessageId}`
        : `message-group-${firstMessageId}-${lastMessageId}`;

      const withAvatar = withUsers && !isOwn && (!isTopicTopMessage || !isComments);
      return (
        <SenderGroupContainer
          key={key}
          id={id}
          message={lastMessage}
          withAvatar={withAvatar}
          appearanceOrder={lastAppearanceOrder}
          canPost={canPost}
        >
          {senderGroupElements}
        </SenderGroupContainer>
      );
    });
  }

  const dateGroups = messageGroups.map((
    dateGroup: MessageDateGroup,
    dateGroupIndex: number,
    dateGroupsArray: MessageDateGroup[],
  ) => {
    const senderGroups = calculateSenderGroups(dateGroup, dateGroupIndex, dateGroupsArray);

    return (
      <div
        className={buildClassName('message-date-group', !(nameChangeDate || photoChangeDate)
        && dateGroupIndex === 0 && 'first-message-date-group')}
        key={dateGroup.datetime}
        onMouseDown={preventMessageInputBlur}
        teactFastList
      >
        <div
          className={buildClassName('sticky-date', areDatesClickable && 'interactive')}
          key="date-header"
          onMouseDown={preventMessageInputBlur}
          onClick={areDatesClickable ? () => openHistoryCalendar({ selectedAt: dateGroup.datetime }) : undefined}
        >
          <span dir="auto">
            {isSchedule && dateGroup.originalDate === SCHEDULED_WHEN_ONLINE && (
              oldLang('MessageScheduledUntilOnline')
            )}
            {isSchedule && dateGroup.originalDate !== SCHEDULED_WHEN_ONLINE && (
              oldLang('MessageScheduledOn', formatHumanDate(oldLang, dateGroup.datetime, undefined, true))
            )}
            {!isSchedule && formatHumanDate(oldLang, dateGroup.datetime)}
          </span>
        </div>
        {senderGroups.flat()}
      </div>
    );
  });

  return (
    <div className="messages-container" teactFastList>
      {withHistoryTriggers && <div ref={backwardsTriggerRef} key="backwards-trigger" className="backwards-trigger" />}
      {shouldRenderAccountInfo
        && <MessageListAccountInfo key={`account_info_${chatId}`} chatId={chatId} hasMessages />}
      {dateGroups.flat()}
      {withHistoryTriggers && (
        <div
          ref={forwardsTriggerRef}
          key="forwards-trigger"
          className="forwards-trigger"
        />
      )}
      <div
        ref={fabTriggerRef}
        key="fab-trigger"
        className="fab-trigger"
      />
      {canShowAds && isViewportNewest && (
        <SponsoredMessage
          key={chatId}
          chatId={chatId}
          containerRef={containerRef}
          observeIntersectionForLoading={observeIntersectionForLoading}
          observeIntersectionForPlaying={observeIntersectionForPlaying}
        />
      )}
    </div>
  );
};

export default memo(MessageListContent);
