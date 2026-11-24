export interface ChatUiTimers {
  typingThrottleMs: number;
  typingExpireMs: number;
  historyPageLimit: number;
  maxPresenceWatch: number;
}

const MAX_TIMER_MS = 2_147_483_647;

export function validateChatTimers(timers: ChatUiTimers): ChatUiTimers {
  if (
    !Number.isFinite(timers.typingThrottleMs) ||
    timers.typingThrottleMs < 1000 ||
    timers.typingThrottleMs > MAX_TIMER_MS
  ) {
    throw new Error(
      `typingThrottleMs must be a finite number between 1000ms and ${MAX_TIMER_MS}ms, got ${timers.typingThrottleMs}`,
    );
  }
  if (
    !Number.isFinite(timers.typingExpireMs) ||
    timers.typingExpireMs <= timers.typingThrottleMs ||
    timers.typingExpireMs > MAX_TIMER_MS
  ) {
    throw new Error(
      `typingExpireMs (${timers.typingExpireMs}) must be a finite number <= ${MAX_TIMER_MS}ms and exceed typingThrottleMs (${timers.typingThrottleMs})`,
    );
  }
  if (
    !Number.isInteger(timers.historyPageLimit) ||
    timers.historyPageLimit < 1 ||
    timers.historyPageLimit > 100
  ) {
    throw new Error(
      `historyPageLimit must be an integer between 1 and 100, got ${timers.historyPageLimit}`,
    );
  }
  if (
    !Number.isInteger(timers.maxPresenceWatch) ||
    timers.maxPresenceWatch < 1 ||
    timers.maxPresenceWatch > 200
  ) {
    throw new Error(
      `maxPresenceWatch must be an integer between 1 and 200, got ${timers.maxPresenceWatch}`,
    );
  }
  return timers;
}

export const CHAT_TIMERS: Readonly<ChatUiTimers> = Object.freeze(
  validateChatTimers({
    typingThrottleMs: 3000,
    typingExpireMs: 4000,
    historyPageLimit: 50,
    maxPresenceWatch: 200,
  }),
);
