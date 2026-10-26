/**
 * Privacy-Conscious Client Telemetry & Analytics Utility
 * Respects "Do Not Track" (DNT) header and does not store PII.
 */

export interface AnalyticsEvent {
  name: string;
  category?: string;
  metadata?: Record<string, string | number | boolean>;
}

export function isDoNotTrackEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.navigator.doNotTrack === "1" ||
    (window as any).doNotTrack === "1" ||
    (window.navigator as any).msDoNotTrack === "1"
  );
}

export function trackPageView(path: string): void {
  if (isDoNotTrackEnabled()) return;

  if (process.env.NODE_ENV === "development") {
    console.debug(`[Analytics:PageView] ${path}`);
  }
}

export function trackEvent(event: AnalyticsEvent): void {
  if (isDoNotTrackEnabled()) return;

  if (process.env.NODE_ENV === "development") {
    console.debug(`[Analytics:Event] ${event.name}`, event.metadata || {});
  }
}
