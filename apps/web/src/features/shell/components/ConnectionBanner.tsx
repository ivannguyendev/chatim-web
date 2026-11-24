import type React from "react";
import { UI_COPY } from "../../../constants/ui-copy";
import type { UiConnectionStatus } from "../../../lib/chatim-types";

export type ConnectionStatus = UiConnectionStatus;

interface Props {
  status: ConnectionStatus;
}

export const ConnectionBanner: React.FC<Props> = ({ status }) => {
  if (status === "connected") {
    return null;
  }

  let message: string;
  let toneClass: string;

  switch (status) {
    case "connecting":
      message = UI_COPY.CONNECTION.CONNECTING;
      toneClass = "bg-amber-100 text-amber-900";
      break;
    case "reauth_required":
      message = UI_COPY.CONNECTION.REAUTH_REQUIRED;
      toneClass = "bg-red-100 text-red-900";
      break;
    case "disconnected":
      message = UI_COPY.CONNECTION.DISCONNECTED;
      toneClass = "bg-red-100 text-red-900";
      break;
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }

  return (
    <div
      role="status"
      className={`px-4 py-2 text-center text-sm font-medium ${toneClass}`}
    >
      {message}
    </div>
  );
};
