import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import {
  commandSchema,
  signalSchema,
  iceServers,
} from "../src/lib/remote-protocol.ts";

test("remote protocol bounds commands and candidate/SDP snapshots", () => {
  for (const value of [
    { type: "tap", x: -1, y: 0 },
    { type: "tap", x: 0, y: 0, token: "bad" },
    { type: "text", text: "x".repeat(501) },
    { type: "navigation", action: "unlock" },
    { type: "swipe", x: 0, y: 0, x2: 1, y2: 1, duration: 10000 },
  ])
    assert.equal(commandSchema.safeParse(value).success, false);
  assert.equal(
    commandSchema.safeParse({ type: "tap", x: 0.5, y: 1 }).success,
    true,
  );
  assert.equal(
    signalSchema.safeParse({
      generation: 1,
      sdp: "s".repeat(65537),
      candidates: [],
    }).success,
    false,
  );
  assert.equal(
    signalSchema.safeParse({
      generation: 1,
      sdp: "offer",
      candidates: Array(65).fill({
        candidate: "a",
        sdpMid: null,
        sdpMLineIndex: 0,
      }),
    }).success,
    false,
  );
});
test("TURN credentials expire with the session; secrets are never returned", () => {
  const saved = { ...process.env };
  try {
    delete process.env.WEBRTC_STUN_URLS;
    delete process.env.WEBRTC_TURN_URLS;
    assert.deepEqual(iceServers("s", new Date()), []);
    process.env.WEBRTC_STUN_URLS = "stun:localhost:3478";
    process.env.WEBRTC_TURN_URLS = "turns:relay.example:443?transport=tcp";
    delete process.env.WEBRTC_TURN_SECRET;
    assert.throws(() => iceServers("s", new Date()));
    process.env.WEBRTC_TURN_SECRET = "synthetic-fixture-secret-32-characters";
    const result = iceServers("s", new Date(200000));
    assert.equal(result[1].username, "200:s");
    assert.ok(result[1].credential);
    assert.ok(!JSON.stringify(result).includes(process.env.WEBRTC_TURN_SECRET));
  } finally {
    for (const k of [
      "WEBRTC_STUN_URLS",
      "WEBRTC_TURN_URLS",
      "WEBRTC_TURN_SECRET",
    ]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test(
  "authenticated signaling, owner isolation, commands, revocation and expiry",
  { skip: !process.env.MONGO_TEST_URI },
  async (t) => {
    const uri = process.env.MONGO_TEST_URI;
    assert.match(uri, /\/browser_proxy_test_[a-zA-Z0-9_-]+(?:\?|$)/);
    // Separate database from the existing parallel regression fixture; never use production data.
    process.env.MONGODB_URI = uri.replace(
      /(browser_proxy_test_[a-zA-Z0-9_-]+)/,
      `$1_remote_${randomBytes(4).toString("hex")}`,
    );
    process.env.NODE_ENV = "production";
    process.env.ALLOW_REGISTRATION = "true";
    process.env.ACCOUNT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const { default: app } = await import("../src/app.ts");
    const { RemoteModel } = await import("../src/lib/remote-model.ts");
    const { DeviceModel } = await import("../src/lib/device-model.ts");
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function req(path, token, body = {}, method = "POST") {
      const r = await fetch(base + path, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: r.status,
        body: r.status === 204 ? null : await r.json(),
      };
    }
    let alice, bob, device, token, session;
    const signal = { generation: 1, sdp: "v=0\r\n", candidates: [] };
    const create = async () => {
      const r = await req("/remote", alice, {
        deviceId: device,
        resolution: 360,
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      session = r.body.id;
      return session;
    };
    try {
      await t.test(
        "pair and assign; require explicit capture readiness",
        async () => {
          alice = (
            await req("/auth/register", null, {
              email: "remote-alice@example.invalid",
              password: "Strong-Synthetic-Password-42",
            })
          ).body.accessToken;
          bob = (
            await req("/auth/register", null, {
              email: "remote-bob@example.invalid",
              password: "Strong-Synthetic-Password-42",
            })
          ).body.accessToken;
          const code = (await req("/devices/pairing", alice)).body.code;
          const paired = await req("/devices/register", null, {
            code,
            name: "Fixture phone",
          });
          token = paired.body.token;
          device = paired.body.device.id;
          const account = (
            await req("/accounts", alice, { name: "Remote account" })
          ).body.id;
          assert.equal(
            (
              await req(
                `/devices/${device}/assignment`,
                alice,
                { accountId: account },
                "PATCH",
              )
            ).status,
            200,
          );
          assert.equal(
            (await req("/remote", alice, { deviceId: device, resolution: 360 }))
              .status,
            409,
          );
          assert.equal(
            (
              await req("/devices/self/heartbeat", token, {
                batteryPercent: 90,
                charging: true,
                temperatureC: 25,
                androidVersion: "fixture",
                model: "fixture",
                captureActive: true,
                accessibilityEnabled: true,
              })
            ).status,
            200,
          );
          await create();
        },
      );
      await t.test(
        "authentication and roles cannot cross owners or device/controller scope",
        async () => {
          assert.equal(
            (await req(`/remote/${session}/poll`, null)).status,
            401,
          );
          assert.equal((await req(`/remote/${session}/poll`, bob)).status, 410);
          assert.equal(
            (await req(`/remote/${session}/poll`, token)).status,
            401,
          );
          assert.equal((await req("/remote/self/poll", alice)).status, 401);
          assert.equal(
            (await req("/remote", bob, { deviceId: device, resolution: 360 }))
              .status,
            404,
          );
        },
      );
      await t.test(
        "offer/answer, idempotent snapshots and one-time command delivery",
        async () => {
          assert.equal(
            (
              await req(`/remote/${session}/command`, alice, {
                type: "tap",
                x: 0.5,
                y: 0.5,
              })
            ).status,
            409,
          );
          assert.equal(
            (await req(`/remote/${session}/signal`, alice, signal)).status,
            200,
          );
          const poll = await req("/remote/self/poll", token);
          assert.equal(poll.body.session.id, session);
          assert.equal(poll.body.session.signal.sdp, signal.sdp);
          assert.equal(
            (await req(`/remote/self/${session}/signal`, token, signal)).status,
            200,
          );
          assert.equal(
            (await req(`/remote/${session}/poll`, alice)).body.signal.sdp,
            signal.sdp,
          );
          assert.equal(
            (await req(`/remote/${session}/signal`, alice, signal)).status,
            200,
          );
          assert.equal(
            (
              await req(`/remote/${session}/signal`, alice, {
                ...signal,
                sdp: "changed",
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await req(`/remote/${session}/command`, alice, {
                type: "tap",
                x: 0.5,
                y: 0.5,
              })
            ).status,
            202,
          );
          assert.equal(
            (await req("/remote/self/poll", token)).body.commands.length,
            1,
          );
          assert.equal(
            (await req("/remote/self/poll", token)).body.commands.length,
            0,
          );
        },
      );
      await t.test(
        "all supported commands are bounded and expired input is discarded",
        async () => {
          for (const command of [
            { type: "swipe", x: 0, y: 0, x2: 1, y2: 1, duration: 300 },
            { type: "text", text: "Synthetic public fixture" },
            { type: "navigation", action: "back" },
          ]) {
            assert.equal(
              (await req(`/remote/${session}/command`, alice, command)).status,
              202,
            );
          }
          assert.equal(
            (await req("/remote/self/poll", token)).body.commands.length,
            3,
          );
          await RemoteModel.updateOne(
            { _id: session },
            {
              $set: {
                commands: [
                  {
                    type: "navigation",
                    action: "home",
                    deadline: Date.now() - 1,
                  },
                ],
              },
            },
          );
          assert.equal(
            (await req("/remote/self/poll", token)).body.commands.length,
            0,
          );
          await DeviceModel.updateOne(
            { _id: device },
            { $set: { "status.accessibilityEnabled": false } },
          );
          assert.equal(
            (
              await req(`/remote/${session}/command`, alice, {
                type: "tap",
                x: 0,
                y: 0,
              })
            ).status,
            409,
          );
          await DeviceModel.updateOne(
            { _id: device },
            { $set: { "status.accessibilityEnabled": true } },
          );
        },
      );
      await t.test(
        "restart clears stale negotiation and input; stale answers fail",
        async () => {
          assert.equal(
            (
              await req(`/remote/${session}/signal`, alice, {
                ...signal,
                generation: 2,
              })
            ).status,
            200,
          );
          assert.equal(
            (await req(`/remote/self/${session}/signal`, token, signal)).status,
            409,
          );
          assert.equal(
            (
              await req(`/remote/${session}/command`, alice, {
                type: "navigation",
                action: "home",
              })
            ).status,
            409,
          );
        },
      );
      await t.test(
        "replacement, explicit revocation, liveness loss and expiry fail closed",
        async () => {
          const old = session;
          await create();
          assert.equal((await req(`/remote/${old}/poll`, alice)).status, 410);
          assert.equal(
            (await req(`/remote/${session}`, alice, {}, "DELETE")).status,
            204,
          );
          assert.equal(
            (await req("/remote/self/poll", token)).body.session,
            null,
          );
          await create();
          await RemoteModel.updateOne(
            { _id: session },
            { $set: { controllerSeenAt: new Date(Date.now() - 6000) } },
          );
          assert.equal(
            (await req("/remote/self/poll", token)).body.session,
            null,
          );
          await RemoteModel.updateOne(
            { _id: session },
            { $set: { expiresAt: new Date(Date.now() - 1) } },
          );
          assert.equal(
            (await req(`/remote/${session}/poll`, alice)).status,
            410,
          );
        },
      );
      await t.test(
        "controller logout invalidates the grant and device signaling",
        async () => {
          await create();
          assert.equal((await req("/auth/logout", alice)).status, 204);
          assert.equal(
            (await req(`/remote/${session}/poll`, alice)).status,
            401,
          );
          assert.equal(
            (await req(`/remote/self/${session}/signal`, token, signal)).status,
            410,
          );
          alice = (
            await req("/auth/login", null, {
              email: "remote-alice@example.invalid",
              password: "Strong-Synthetic-Password-42",
            })
          ).body.accessToken;
        },
      );
      await t.test(
        "unassignment and device revocation invalidate existing grants",
        async () => {
          await create();
          await DeviceModel.updateOne(
            { _id: device },
            { $set: { accountId: null } },
          );
          assert.equal(
            (await req(`/remote/${session}/poll`, alice)).status,
            410,
          );
          await DeviceModel.updateOne(
            { _id: device },
            { $set: { revokedAt: new Date() } },
          );
          assert.equal((await req("/remote/self/poll", token)).status, 401);
        },
      );
    } finally {
      await new Promise((r) => server.close(r));
      if (mongoose.connection.readyState) {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
      }
    }
  },
);
