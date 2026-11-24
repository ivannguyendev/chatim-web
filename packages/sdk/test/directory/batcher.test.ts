import { afterEach, describe, expect, it, vi } from "vitest";
import { DirectoryBatcher } from "../../src/directory/batcher";

describe("DirectoryBatcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("batches multiple getUser calls into a single GetUsers HTTP request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        users: [
          { id: "user-1", displayName: "User One" },
          { id: "user-2", displayName: "User Two" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const batcher = new DirectoryBatcher({
      identityUrl: "http://localhost:8084",
      getToken: async () => "token-1",
    });

    const [u1, u2] = await Promise.all([
      batcher.getUser("user-1"),
      batcher.getUser("user-2"),
    ]);

    expect(u1?.displayName).toBe("User One");
    expect(u2?.displayName).toBe("User Two");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8084/chatim.identity.v1.DirectoryService/GetUsers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userIds: ["user-1", "user-2"] }),
      }),
    );
  });
});
