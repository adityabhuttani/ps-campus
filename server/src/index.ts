import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./app";
import { initSocket } from "./lib/socket";

const port = Number(process.env.PORT ?? 4000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = createApp();
const httpServer = createServer(app);
initSocket(httpServer, clientOrigin);

httpServer.listen(port, () => {
  console.log(`Campus hiring server listening on http://localhost:${port}`);
});
