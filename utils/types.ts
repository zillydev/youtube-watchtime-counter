/** Duration data from a single YouTube tab */
export interface TabDurationInfo {
  tabId: number;
  url: string;
  title: string;
  durationSeconds: number;
  currentTimeSeconds: number;
  isLoading: boolean;
  videoType: 'video' | 'short';
}

/** Data sent to the popup for rendering */
export interface PopupData {
  tabs: TabDurationInfo[];
  totalDurationSeconds: number;
  totalFormatted: string;
  displayEnabled: boolean;
}

/** Response from content script when asked for duration */
export interface DurationResponse {
  durationSeconds: number;
  currentTimeSeconds: number;
  isLoading: boolean;
  videoType: 'video' | 'short';
  url: string;
  title: string;
}
