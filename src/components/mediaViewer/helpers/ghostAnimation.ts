import type { ApiDimensions, ApiMessage } from '../../../api/types';
import { MediaViewerOrigin } from '../../../types';

import { ANIMATION_END_DELAY, MESSAGE_CONTENT_SELECTOR } from '../../../config';
import { requestMutation } from '../../../lib/fasterdom/fasterdom';
import { getMessageHtmlId } from '../../../global/helpers';
import { applyStyles } from '../../../util/animation';
import { IS_TOUCH_ENV } from '../../../util/browser/windowEnvironment';
import stopEvent from '../../../util/stopEvent';
import getOffsetToContainer from '../../../util/visibility/getOffsetToContainer';
import { isElementInViewport } from '../../../util/visibility/isElementInViewport';
import windowSize from '../../../util/windowSize';
import {
  calculateDimensions,
  getMediaViewerAvailableDimensions,
  MEDIA_VIEWER_MEDIA_QUERY,
  REM,
} from '../../common/helpers/mediaDimensions';

const ANIMATION_DURATION = 200;

export function animateOpening(
  hasFooter: boolean,
  origin: MediaViewerOrigin,
  bestImageData: string,
  dimensions: ApiDimensions,
  isVideo: boolean,
  message?: ApiMessage,
  mediaIndex?: number,
) {
  const { mediaEl: fromImage } = getNodes(origin, message, mediaIndex);
  if (!fromImage) {
    return;
  }

  const { width: windowWidth } = windowSize.get();
  const {
    width: availableWidth, height: availableHeight,
  } = getMediaViewerAvailableDimensions(hasFooter, isVideo);
  const { width: toWidth, height: toHeight } = calculateDimensions(
    availableWidth, availableHeight, dimensions.width, dimensions.height,
  );
  const toLeft = (windowWidth - toWidth) / 2;
  const toTop = getTopOffset(hasFooter) + (availableHeight - toHeight) / 2;

  let {
    top: fromTop, left: fromLeft, width: fromWidth, height: fromHeight,
  } = fromImage.getBoundingClientRect();

  if ([
    MediaViewerOrigin.SharedMedia,
    MediaViewerOrigin.Album,
    MediaViewerOrigin.ScheduledAlbum,
    MediaViewerOrigin.SearchResult,
  ].includes(origin)) {
    const uncovered = uncover(toWidth, toHeight, fromTop, fromLeft, fromWidth, fromHeight);
    fromTop = uncovered.top;
    fromLeft = uncovered.left;
    fromWidth = uncovered.width;
    fromHeight = uncovered.height;
  }

  const fromTranslateX = (fromLeft + fromWidth / 2) - (toLeft + toWidth / 2);
  const fromTranslateY = (fromTop + fromHeight / 2) - (toTop + toHeight / 2);
  const fromScaleX = fromWidth / toWidth;
  const fromScaleY = fromHeight / toHeight;

  requestMutation(() => {
    const ghost = createGhost(bestImageData || fromImage);
    applyStyles(ghost, {
      top: `${toTop}px`,
      left: `${toLeft}px`,
      width: `${toWidth}px`,
      height: `${toHeight}px`,
      transform: `translate3d(${fromTranslateX}px, ${fromTranslateY}px, 0) scale(${fromScaleX}, ${fromScaleY})`,
    });
    applyShape(ghost, origin);

    document.body.appendChild(ghost);
    document.body.classList.add('ghost-animating');

    requestMutation(() => {
      ghost.style.transform = '';
      clearShape(ghost);

      setTimeout(() => {
        requestMutation(() => {
          if (document.body.contains(ghost)) {
            document.body.removeChild(ghost);
          }
          document.body.classList.remove('ghost-animating');
        });
      }, ANIMATION_DURATION + ANIMATION_END_DELAY);
    });
  });
}

export function animateClosing(
  origin: MediaViewerOrigin, bestImageData: string, message?: ApiMessage, mediaIndex?: number,
) {
  const { container, mediaEl: toImage } = getNodes(origin, message, mediaIndex);
  if (!toImage) {
    return;
  }

  const fromImage = document.getElementById('MediaViewer')!.querySelector<HTMLImageElement>(
    '.MediaViewerSlide--active img, .MediaViewerSlide--active video',
  );
  if (!fromImage) {
    return;
  }

  const {
    top: fromTop, left: fromLeft, width: fromWidth, height: fromHeight,
  } = fromImage.getBoundingClientRect();
  const {
    top: targetTop, left: toLeft, width: toWidth, height: toHeight,
  } = toImage.getBoundingClientRect();

  let toTop = targetTop;
  if (!isElementInViewport(container)) {
    const { height: windowHeight } = windowSize.get();
    toTop = targetTop < fromTop ? -toHeight : windowHeight;
  }

  const fromTranslateX = (fromLeft + fromWidth / 2) - (toLeft + toWidth / 2);
  const fromTranslateY = (fromTop + fromHeight / 2) - (toTop + toHeight / 2);
  let fromScaleX = fromWidth / toWidth;
  let fromScaleY = fromHeight / toHeight;

  const shouldFadeOut = (
    [
      MediaViewerOrigin.Inline,
      MediaViewerOrigin.ScheduledInline,
      MediaViewerOrigin.Album,
      MediaViewerOrigin.ScheduledAlbum,
    ].includes(origin)
    && !isMessageImageFullyVisible(toImage)
  );

  if ([
    MediaViewerOrigin.SharedMedia,
    MediaViewerOrigin.Album,
    MediaViewerOrigin.ScheduledAlbum,
    MediaViewerOrigin.SearchResult,
  ].includes(origin)) {
    if (fromScaleX > fromScaleY) {
      fromScaleX = fromScaleY;
    } else if (fromScaleY > fromScaleX) {
      fromScaleY = fromScaleX;
    }
  }

  const existingGhost = document.getElementsByClassName('ghost')[0] as HTMLDivElement;
  const ghost = existingGhost || createGhost(bestImageData || toImage, origin);

  let styles: Record<string, string>;
  if (existingGhost) {
    const {
      top, left, width, height,
    } = existingGhost.getBoundingClientRect();
    const scaleX = width / toWidth;
    const scaleY = height / toHeight;

    styles = {
      transition: 'none',
      top: `${toTop}px`,
      left: `${toLeft}px`,
      transformOrigin: 'top left',
      transform: `translate3d(${left - toLeft}px, ${top - toTop}px, 0) scale(${scaleX}, ${scaleY})`,
      width: `${toWidth}px`,
      height: `${toHeight}px`,
    };
  } else {
    styles = {
      top: `${toTop}px`,
      left: `${toLeft}px`,
      width: `${toWidth}px`,
      height: `${toHeight}px`,
      transform: `translate3d(${fromTranslateX}px, ${fromTranslateY}px, 0) scale(${fromScaleX}, ${fromScaleY})`,
    };
  }

  requestMutation(() => {
    applyStyles(ghost, styles);
    if (!existingGhost) document.body.appendChild(ghost);
    document.body.classList.add('ghost-animating');

    requestMutation(() => {
      if (existingGhost) {
        existingGhost.style.transition = '';
      }

      ghost.style.transform = '';

      if (shouldFadeOut) {
        ghost.style.opacity = '0';
      }

      applyShape(ghost, origin);

      setTimeout(() => {
        requestMutation(() => {
          if (document.body.contains(ghost)) {
            document.body.removeChild(ghost);
          }
          document.body.classList.remove('ghost-animating');
        });
      }, ANIMATION_DURATION + ANIMATION_END_DELAY);
    });
  });
}

function createGhost(source: string | HTMLImageElement | HTMLVideoElement, origin?: MediaViewerOrigin) {
  const ghost = document.createElement('div');
  ghost.classList.add('ghost');

  const img = new Image();
  img.draggable = false;
  img.oncontextmenu = stopEvent;

  if (typeof source === 'string') {
    img.src = source;
  } else if (source instanceof HTMLVideoElement) {
    img.src = source.poster;
  } else {
    img.src = source.src;
  }

  ghost.appendChild(img);

  if (origin === MediaViewerOrigin.ProfileAvatar || origin === MediaViewerOrigin.SettingsAvatar) {
    ghost.classList.add('ProfileInfo');
    if (origin === MediaViewerOrigin.SettingsAvatar) {
      ghost.classList.add('self');
    }
    const profileInfo = document.querySelector(
      origin === MediaViewerOrigin.ProfileAvatar
        ? '#RightColumn .ProfileInfo .info'
        : '#Settings .ProfileInfo .info',
    );
    if (profileInfo) {
      ghost.appendChild(profileInfo.cloneNode(true));
    }
  }

  return ghost;
}

function uncover(realWidth: number, realHeight: number, top: number, left: number, width: number, height: number) {
  if (realWidth === realHeight) {
    const size = Math.max(width, height) * (realWidth / realHeight);
    left -= (size - width) / 2;
    top -= (size - height) / 2;
    width = size;
    height = size;
  } else if (realWidth > realHeight) {
    const srcWidth = width;
    width = height * (realWidth / realHeight);
    left -= (width - srcWidth) / 2;
  } else if (realHeight > realWidth) {
    const srcHeight = height;
    height = width * (realHeight / realWidth);
    top -= (height - srcHeight) / 2;
  }

  return {
    top, left, width, height,
  };
}

function isMessageImageFullyVisible(imageEl: HTMLElement) {
  const messageListElement = document.querySelector<HTMLDivElement>('.Transition_slide-active > .MessageList')!;

  const { top } = getOffsetToContainer(imageEl, messageListElement);

  return top > messageListElement.scrollTop
    && top + imageEl.offsetHeight < messageListElement.scrollTop + messageListElement.offsetHeight;
}

function getTopOffset(hasFooter: boolean) {
  const mql = window.matchMedia(MEDIA_VIEWER_MEDIA_QUERY);
  let topOffsetRem = 4.125;
  if (hasFooter && !IS_TOUCH_ENV) {
    topOffsetRem += mql.matches ? 0.875 : 2.125;
  }

  return topOffsetRem * REM;
}

function getNodes(origin: MediaViewerOrigin, message?: ApiMessage, index?: number) {
  let containerSelector;
  let mediaSelector;

  switch (origin) {
    case MediaViewerOrigin.Album:
    case MediaViewerOrigin.ScheduledAlbum:
      // eslint-disable-next-line @stylistic/max-len
      containerSelector = `.Transition_slide-active > .MessageList #album-media-${getMessageHtmlId(message!.id, index)}`;
      mediaSelector = '.full-media';
      break;

    case MediaViewerOrigin.PreviewMedia:
      containerSelector = `#preview-media${index}`;
      mediaSelector = 'img';
      break;

    case MediaViewerOrigin.SharedMedia:
      containerSelector = `#shared-media${getMessageHtmlId(message!.id, index)}`;
      mediaSelector = 'img';
      break;

    case MediaViewerOrigin.SearchResult:
      containerSelector = `#search-media${getMessageHtmlId(message!.id, index)}`;
      mediaSelector = 'img';
      break;

    case MediaViewerOrigin.MiddleHeaderAvatar:
      containerSelector = '.MiddleHeader .Transition_slide-active .ChatInfo .Avatar';
      mediaSelector = '.avatar-media';
      break;

    case MediaViewerOrigin.SettingsAvatar:
      containerSelector = '#Settings .ProfileInfo .Transition_slide-active .ProfilePhoto';
      mediaSelector = '.avatar-media';
      break;

    case MediaViewerOrigin.ProfileAvatar:
      containerSelector = '#RightColumn .ProfileInfo .Transition_slide-active .ProfilePhoto';
      mediaSelector = '.avatar-media';
      break;

    case MediaViewerOrigin.ChannelAvatar:
    case MediaViewerOrigin.SuggestedAvatar:
      containerSelector = `.Transition_slide-active > .MessageList #${getMessageHtmlId(message!.id, index)}`;
      mediaSelector = '.Avatar img';
      break;

    case MediaViewerOrigin.StarsTransaction:
      containerSelector = '.transaction-media-preview';
      mediaSelector = index === 0 ? `.stars-transaction-media-${index} :is(img, video)` : undefined;
      break;

    case MediaViewerOrigin.SponsoredMessage:
      containerSelector = '.Transition_slide-active > .MessageList .sponsored-media-preview';
      mediaSelector = `${MESSAGE_CONTENT_SELECTOR} .full-media,${MESSAGE_CONTENT_SELECTOR} .thumbnail:not(.blurred-bg)`;
      break;

    case MediaViewerOrigin.ScheduledInline:
    case MediaViewerOrigin.Inline:
    default:
      containerSelector = `.Transition_slide-active > .MessageList #${getMessageHtmlId(message!.id, index)}`;
      mediaSelector = `${MESSAGE_CONTENT_SELECTOR} .full-media,${MESSAGE_CONTENT_SELECTOR} .thumbnail:not(.blurred-bg)`;
  }

  const container = document.querySelector<HTMLElement>(containerSelector)!;
  const mediaEls = mediaSelector
    ? container?.querySelectorAll<HTMLImageElement | HTMLVideoElement>(mediaSelector) : undefined;

  return {
    container,
    mediaEl: mediaEls?.[0],
  };
}

function applyShape(ghost: HTMLDivElement, origin: MediaViewerOrigin) {
  switch (origin) {
    case MediaViewerOrigin.Album:
    case MediaViewerOrigin.ScheduledAlbum:
    case MediaViewerOrigin.Inline:
    case MediaViewerOrigin.ScheduledInline:
    case MediaViewerOrigin.StarsTransaction:
    case MediaViewerOrigin.PreviewMedia:
      ghost.classList.add('rounded-corners');
      break;

    case MediaViewerOrigin.SharedMedia:
    case MediaViewerOrigin.SettingsAvatar:
    case MediaViewerOrigin.ProfileAvatar:
    case MediaViewerOrigin.SearchResult:
      (ghost.firstChild as HTMLElement).style.objectFit = 'cover';
      break;

    case MediaViewerOrigin.MiddleHeaderAvatar:
    case MediaViewerOrigin.SuggestedAvatar:
    case MediaViewerOrigin.ChannelAvatar:
      ghost.classList.add('circle');
      break;
  }
}

function clearShape(ghost: HTMLDivElement) {
  (ghost.firstChild as HTMLElement).style.objectFit = 'default';
  ghost.classList.remove('rounded-corners', 'circle');
}
