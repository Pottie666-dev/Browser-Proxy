import net from "node:net";
import { spawn } from "node:child_process";
const socketPath = process.env.PROFILE_GATEWAY_SOCKET;
const connections = new Set();
const server = net.createServer((client) => {
  const upstream = net.connect(socketPath);
  connections.add(client);
  connections.add(upstream);
  client.pipe(upstream);
  upstream.pipe(client);
  const stop = () => {
    client.destroy();
    upstream.destroy();
    connections.delete(client);
    connections.delete(upstream);
  };
  client.on("error", stop);
  upstream.on("error", stop);
  client.on("close", stop);
  upstream.on("close", stop);
});
server.once("error", () => {
  console.error("Profile relay could not bind");
  process.exit(1);
});
server.listen(
  Number(process.env.PROFILE_RELAY_PORT ?? 18080),
  "127.0.0.1",
  () => {
    const port = server.address().port;
    console.log(`PROFILE_RELAY_READY:${port}`);
    const args = process.argv
      .slice(2)
      .map((arg) =>
        arg.startsWith("--proxy-server=")
          ? `--proxy-server=http://127.0.0.1:${port}`
          : arg,
      );
    const child = spawn(process.env.PROFILE_CHROMIUM_EXECUTABLE, args, {
      stdio: ["inherit", "inherit", "inherit", 3, 4],
    });
    child.once("error", () => process.exit(1));
    for (const signal of ["SIGTERM", "SIGINT"])
      process.on(signal, () => child.kill(signal));
    child.once("exit", (code) => {
      for (const socket of connections) socket.destroy();
      server.close(() => process.exit(code ?? 1));
    });
  },
);
