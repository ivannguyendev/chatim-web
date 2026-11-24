export function getReconnectDelayMs(
  closeCode: number,
  attempt: number,
): number | null {
  if (closeCode === 4003) {
    return null;
  }

  if (closeCode === 1001) {
    return Math.floor(Math.random() * 60001);
  }

  if (closeCode === 1000 || closeCode === 1006) {
    return Math.floor(Math.random() * 3001);
  }

  if (closeCode === 4009) {
    return 30000 + Math.floor(Math.random() * 30001);
  }

  if (closeCode === 4001) {
    return 0;
  }

  const base = 1000 * 2 ** attempt;
  return Math.min(60000, base);
}
