import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HttpServer, clientOrigin: string): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: clientOrigin, credentials: true },
  });

  io.on("connection", (socket) => {
    socket.on("join-drive", (driveId: string) => {
      socket.join(driveRoom(driveId));
    });
    socket.on("leave-drive", (driveId: string) => {
      socket.leave(driveRoom(driveId));
    });
  });

  return io;
}

export function driveRoom(driveId: string): string {
  return `drive:${driveId}`;
}

export function emitToDrive(driveId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(driveRoom(driveId)).emit(event, payload);
}
