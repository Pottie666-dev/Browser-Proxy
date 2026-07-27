import { Router, type IRouter } from "express";
import { connectMongo, hasMongoUri } from "../lib/mongo";
import { ProxyModel } from "../lib/proxy-model";

const router: IRouter = Router();

async function ready() {
  if (!hasMongoUri()) throw Object.assign(new Error("MongoDB is required for proxy records"), { status: 503 });
  await connectMongo();
}

function clean(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const input = body as Record<string, unknown>;
  const allowed = ["name", "type", "host", "port", "username", "password", "region", "enabled"];
  return Object.fromEntries(allowed.filter((key) => key in input).map((key) => [key, input[key]]));
}

router.get("/", async (_req, res, next) => {
  try {
    await ready();
    res.json(await ProxyModel.find({}).sort({ updatedAt: -1 }).lean().then((items) => items.map((item: any) => ({ ...item, id: item._id.toString(), _id: undefined, password: undefined, hasPassword: Boolean(item.password) }))));
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    await ready();
    const proxy = await ProxyModel.create(clean(req.body));
    res.status(201).json(proxy.toJSON());
  } catch (error) { next(error); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    await ready();
    const proxy = await ProxyModel.findByIdAndUpdate(req.params.id, { $set: clean(req.body) }, { new: true, runValidators: true });
    if (!proxy) return void res.status(404).json({ message: "Proxy not found" });
    res.json(proxy.toJSON());
  } catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await ready();
    const proxy = await ProxyModel.findByIdAndDelete(req.params.id);
    if (!proxy) return void res.status(404).json({ message: "Proxy not found" });
    await (await import("../lib/account-model")).AccountModel.updateMany({ proxyId: req.params.id }, { $unset: { proxyId: 1 } });
    res.status(204).send();
  } catch (error) { next(error); }
});

router.post("/:id/check", async (req, res, next) => {
  try {
    await ready();
    const proxy = await ProxyModel.findByIdAndUpdate(req.params.id, { $set: { status: "unchecked", lastCheckedAt: new Date(), lastError: "Traffic check is enabled in Stage 9B." } }, { new: true });
    if (!proxy) return void res.status(404).json({ message: "Proxy not found" });
    res.json(proxy.toJSON());
  } catch (error) { next(error); }
});

export default router;
