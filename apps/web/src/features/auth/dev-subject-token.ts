export const DEV_SUBJECT_TOKEN_PATH = "/__dev/subject-token";

export async function fetchDevSubjectToken(
  userId: string,
  displayName: string,
): Promise<string> {
  const query = new URLSearchParams({ user: userId, name: displayName });
  const response = await fetch(`${DEV_SUBJECT_TOKEN_PATH}?${query}`, {
    cache: "no-store",
  });
  const body = (await response.text()).trim();
  if (!response.ok) {
    throw new Error(
      `Dev subject token unavailable (${response.status}): ${body || "run `pnpm dev:issuer`"}`,
    );
  }
  return body;
}
