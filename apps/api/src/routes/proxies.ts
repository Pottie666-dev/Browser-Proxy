import { Router, type IRouter } from "express";
import { connectMongo, hasMongoUri } from "../lib/mongo";
import { ProxyModel } from "../lib/proxy-model";
import { requireAuth, ownerFilter, audit } from "../lib/auth";
import { encrypt, decrypt, HttpError } from "../lib/security";
import { Types } from "mongoose";
import { z } from "zod";

const router: IRouter = Router();
router.use(requireAuth);

async function ready() {
  if (!hasMongoUri())
    throw new HttpError(503, "MongoDB is required for proxy records");
  await connectMongo();
}

const proxyInput = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    type: z.enum(["http", "https", "socks5"]).optional(),
    host: z.string().trim().min(1).max(253).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    username: z.string().max(256).optional(),
    password: z.string().max(1024).optional(),
    region: z.string().max(100).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
function clean(body: unknown): Record<string, unknown> {
  return proxyInput.parse(body);
}

router.get("/", async (_req, res, next) => {
  try {
    await ready();
    res.json(
      await ProxyModel.find({ ownerId: res.locals.userId })
        .sort({ updatedAt: -1 })
        .lean()
        .then((items) =>
          items.map((item: any) => ({
            ...item,
            username: item.username
              ? decrypt(
                  item.username,
                  `proxy:${res.locals.userId}:${item._id}:username`,
                )
              : null,
            id: item._id.toString(),
            _id: undefined,
            password: undefined,
            ownerId: undefined,
            hasPassword: Boolean(item.password),
          })),
        ),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    await ready();
    const id = new Types.ObjectId().toString();
    const data = clean(req.body);
    for (const field of ["username", "password"])
      if (data[field] !== undefined)
        data[field] = data[field]
          ? encrypt(data[field], `proxy:${res.locals.userId}:${id}:${field}`)
          : null;
    const proxy = await ProxyModel.create({
      ...data,
      _id: id,
      ownerId: res.locals.userId,
    });
    await audit(res.locals.userId, "proxy.create", id);
    res.status(201).json(proxy.toJSON());
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    await ready();
    const proxy = await ProxyModel.findOneAndUpdate(
      ownerFilter(req.params.id, res.locals.userId),
      {
        $set: (() => {
          const data = clean(req.body);
          for (const field of ["username", "password"])
            if (data[field] !== undefined)
              data[field] = data[field]
                ? encrypt(
                    data[field],
                    `proxy:${res.locals.userId}:${req.params.id}:${field}`,
                  )
                : null;
          return data;
        })(),
      },
      { new: true, runValidators: true },
    );
    if (!proxy)
      return void res.status(404).json({ message: "Proxy not found" });
    res.json(proxy.toJSON());
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await ready();
    const proxy = await ProxyModel.findOneAndDelete(
      ownerFilter(req.params.id, res.locals.userId),
    );
    if (!proxy)
      return void res.status(404).json({ message: "Proxy not found" });
    await (
      await import("../lib/account-model")
    ).AccountModel.updateMany(
      { proxyId: req.params.id, ownerId: res.locals.userId },
      { $unset: { proxyId: 1 } },
    );
    await audit(res.locals.userId, "proxy.delete", req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/:id/check", async (req, res, next) => {
  try {
    await ready();
    const proxy = await ProxyModel.findOneAndUpdate(
      ownerFilter(req.params.id, res.locals.userId),
      {
        $set: {
          status: "unchecked",
          lastCheckedAt: new Date(),
          lastError:
            "Traffic verification requires the Stage 3 proxy transport.",
        },
      },
      { new: true },
    );
    if (!proxy)
      return void res.status(404).json({ message: "Proxy not found" });
    res.json(proxy.toJSON());
  } catch (error) {
    next(error);
  }
});

export default router;
