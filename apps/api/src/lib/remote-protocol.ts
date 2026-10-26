import { createHmac } from "node:crypto";
import { z } from "zod";
export const signalSchema = z
  .object({
    generation: z.number().int().min(1).max(1000),
    sdp: z.string().min(1).max(65536),
    candidates: z
      .array(
        z
          .object({
            candidate: z.string().max(2048),
            sdpMid: z.string().max(80).nullable(),
            sdpMLineIndex: z.number().int().min(0).max(16).nullable(),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();
const coordinate = z.number().finite().min(0).max(1);
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tap"), x: coordinate, y: coordinate }).strict(),
  z
    .object({
      type: z.literal("swipe"),
      x: coordinate,
      y: coordinate,
      x2: coordinate,
      y2: coordinate,
      duration: z.number().int().min(100).max(1000),
    })
    .strict(),
  z
    .object({ type: z.literal("text"), text: z.string().min(1).max(500) })
    .strict(),
  z
    .object({
      type: z.literal("navigation"),
      action: z.enum(["back", "home", "recents"]),
    })
    .strict(),
]);
/** No default external services: host candidates work on a local LAN. */
export function iceServers(sessionId: string, expiresAt: Date) {
  const servers: { urls: string[]; username?: string; credential?: string }[] =
    [];
  const stun = (process.env.WEBRTC_STUN_URLS || "").split(",").filter(Boolean);
  const turn = (process.env.WEBRTC_TURN_URLS || "").split(",").filter(Boolean);
  if (stun.some((u) => !/^stuns?:[a-zA-Z0-9.:[\]-]+$/.test(u)))
    throw new Error("Invalid STUN configuration");
  if (
    turn.some(
      (u) => !/^turns?:[a-zA-Z0-9.:[\]-]+(?:\?transport=(?:udp|tcp))?$/.test(u),
    )
  )
    throw new Error("Invalid TURN configuration");
  if (stun.length) servers.push({ urls: stun });
  if (turn.length) {
    const secret = process.env.WEBRTC_TURN_SECRET;
    if (!secret || secret.length < 32)
      throw new Error("TURN shared secret required");
    const username = `${Math.floor(expiresAt.getTime() / 1000)}:${sessionId}`;
    servers.push({
      urls: turn,
      username,
      credential: createHmac("sha1", secret).update(username).digest("base64"),
    });
  }
  return servers;
}
