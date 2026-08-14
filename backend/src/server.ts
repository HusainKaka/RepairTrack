import { createServer } from "node:http";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { createApp } from "./app.js";

const server = createServer(createApp());
server.listen(env.PORT, () => console.log(`RepairTrack API listening on port ${env.PORT}`));

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received; shutting down.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

