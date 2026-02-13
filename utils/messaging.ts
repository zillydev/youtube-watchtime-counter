import { defineExtensionMessaging } from '@webext-core/messaging';
import type { DurationResponse, PopupData } from './types';

interface ProtocolMap {
  getDuration(data: undefined): DurationResponse;
  reportDuration(data: DurationResponse): void;
  getPopupData(data: undefined): PopupData;
  toggleDisplay(data: undefined): boolean;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
