import type React from "react";
import { UI_COPY } from "../../../constants/ui-copy";

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

interface Props {
  status: ConnectionStatus;
}

export const ConnectionBanner: React.FC<Props> = ({ status }) => {
  if (status === "connected") return null;

  const isConnecting = status === "connecting";
  const message = isConnecting
    ? UI_COPY.CONNECTION.CONNECTING
    : UI_COPY.CONNECTION.DISCONNECTED;

  return (
    <div
      role="status"
      className={`px-4 py-2 text-center text-sm font-medium ${
        isConnecting ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900"
      }`}
    >
      {message}
    </div>
  );
};
