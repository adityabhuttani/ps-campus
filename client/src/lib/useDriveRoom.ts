import { useEffect } from "react";
import { getSocket } from "./socket";

// Joins the drive's socket.io room for the lifetime of the component so live
// score/status updates for that drive reach this client.
export function useDriveRoom(driveId: string | undefined, onEvent: (event: string, payload: unknown) => void) {
  useEffect(() => {
    if (!driveId) return;
    const socket = getSocket();
    socket.emit("join-drive", driveId);

    const handler = (event: string) => (payload: unknown) => onEvent(event, payload);
    const scoreHandler = handler("score:updated");
    const statusHandler = handler("status:updated");
    const finalizedHandler = handler("drive:finalized");

    socket.on("score:updated", scoreHandler);
    socket.on("status:updated", statusHandler);
    socket.on("drive:finalized", finalizedHandler);

    return () => {
      socket.emit("leave-drive", driveId);
      socket.off("score:updated", scoreHandler);
      socket.off("status:updated", statusHandler);
      socket.off("drive:finalized", finalizedHandler);
    };
  }, [driveId, onEvent]);
}
