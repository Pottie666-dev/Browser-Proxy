import { Router, type IRouter } from "express";

const router: IRouter = Router();

function normalizeTarget(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

router.get("/", async (req, res, next) => {
  try {
    const target = normalizeTarget(req.query.url);

    if (!target) {
      res.status(400).json({ error: "Missing or invalid url query parameter" });
      return;
    }

    const userAgent =
      typeof req.query.userAgent === "string" && req.query.userAgent.trim()
        ? req.query.userAgent.trim()
        : "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

    const upstream = await fetch(target, {
      headers: {
        "user-agent": userAgent,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      },
      redirect: "follow",
    });

    const contentType = upstream.headers.get("content-type") ?? "text/html; charset=utf-8";
    const body = Buffer.from(await upstream.arrayBuffer());

    res.status(upstream.status);
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "no-store");
    res.send(body);
  } catch (error) {
    next(error);
  }
});

export default router;
