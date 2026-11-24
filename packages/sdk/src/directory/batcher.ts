export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  state?: string;
}

export interface DirectoryBatcherOptions {
  identityUrl: string;
  getToken: () => Promise<string>;
}

interface QueuedItem {
  userId: string;
  resolve: (user: UserProfile | null) => void;
  reject: (err: any) => void;
}

export class DirectoryBatcher {
  private identityUrl: string;
  private getToken: () => Promise<string>;
  private queue: QueuedItem[] = [];
  private flushTimer: any = null;

  constructor(options: DirectoryBatcherOptions) {
    this.identityUrl = options.identityUrl.replace(/\/$/, "");
    this.getToken = options.getToken;
  }

  async getMyProfile(): Promise<UserProfile> {
    const token = await this.getToken();
    const res = await fetch(
      `${this.identityUrl}/chatim.identity.v1.DirectoryService/GetMyProfile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: "{}",
      },
    );

    if (!res.ok) {
      throw new Error(`GetMyProfile failed with status ${res.status}`);
    }

    return res.json();
  }

  getUser(userId: string): Promise<UserProfile | null> {
    return new Promise((resolve, reject) => {
      this.queue.push({ userId, resolve, reject });
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), 0);
      }
    });
  }

  private async flush() {
    this.flushTimer = null;
    const items = [...this.queue];
    this.queue = [];

    if (items.length === 0) return;

    const uniqueIds = Array.from(new Set(items.map((i) => i.userId))).slice(
      0,
      100,
    );

    try {
      const token = await this.getToken();
      const res = await fetch(
        `${this.identityUrl}/chatim.identity.v1.DirectoryService/GetUsers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userIds: uniqueIds }),
        },
      );

      if (!res.ok) {
        throw new Error(`GetUsers failed with status ${res.status}`);
      }

      const data = await res.json();
      const usersList: UserProfile[] = data.users || [];
      const userMap = new Map(usersList.map((u) => [u.id, u]));

      for (const item of items) {
        item.resolve(userMap.get(item.userId) || null);
      }
    } catch (err) {
      for (const item of items) {
        item.reject(err);
      }
    }
  }
}
