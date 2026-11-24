export interface ChatUiTimers {
  typingThrottleMs: number;
  typingExpireMs: number;
  historyPageLimit: number;
  maxPresenceWatch: number;
}

export function validateChatTimers(timers: ChatUiTimers): ChatUiTimers {
  if (timers.typingThrottleMs < 1000) {
    throw new Error(
      `typingThrottleMs must be >= 1000ms to respect server rate limit, got ${timers.typingThrottleMs}`,
    );
  }
  if (timers.typingExpireMs <= timers.typingThrottleMs) {
    throw new Error(
      `typingExpireMs (${timers.typingExpireMs}) must exceed typingThrottleMs (${timers.typingThrottleMs})`,
    );
  }
  if (timers.historyPageLimit < 1 || timers.historyPageLimit > 100) {
    throw new Error(
      `historyPageLimit must be between 1 and 100, got ${timers.historyPageLimit}`,
    );
  }
  if (timers.maxPresenceWatch < 1 || timers.maxPresenceWatch > 200) {
    throw new Error(
      `maxPresenceWatch must be between 1 and 200, got ${timers.maxPresenceWatch}`,
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
