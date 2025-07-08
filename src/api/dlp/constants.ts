import {ApiChat} from "../types";
import {MessageInterface} from "./message.interface.ts";

export const CONTENT_TYPE_JSON = 'application/json';
export const CONTENT_TYPE_MULTIPART = 'multipart/form-data';

export const DLP_HEADERS = {
  'Content-Type': CONTENT_TYPE_JSON,
  Authorization: `Bearer c3RhdGljX3Rva2VuX2Zvcl93ZWJzZXJ2ZXI`,
};

export const ChatType: Record<ApiChat['type'], MessageInterface['chatType']> = {
  chatTypePrivate: 'user',
  chatTypeSecret: 'user',
  chatTypeBasicGroup: 'group',
  chatTypeSuperGroup: 'megaGroup',
  chatTypeChannel: 'channel',
};
