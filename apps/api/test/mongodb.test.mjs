import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const uri = process.env.MONGO_TEST_URI;
test(
  "MongoDB authentication, ownership, encrypted persistence and migration",
  { skip: !uri },
  async (t) => {
    assert.match(
      uri,
      /\/browser_proxy_test_[a-zA-Z0-9_-]+(?:\?|$)/,
      "Use a dedicated browser_proxy_test_ database; production databases are refused",
    );
    const root = fileURLToPath(new URL("../", import.meta.url));
    const key = randomBytes(32).toString("base64");
    const connection = await mongoose.createConnection(uri).asPromise();
    if ((await connection.db.listCollections().toArray()).length) {
      await connection.close();
      throw new Error("Refusing to use a non-empty test database");
    }
    let child, base, alice, bob, account, state;
    const start = async (registration = "true") => {
      const probe = createServer();
      probe.listen(0, "127.0.0.1");
      await once(probe, "listening");
      const port = probe.address().port;
      await new Promise((resolve) => probe.close(resolve));
      base = `http://127.0.0.1:${port}`;
      let logs = "";
      child = spawn(process.execPath, ["dist/index.mjs"], {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: "production",
          MONGODB_URI: uri,
          ACCOUNT_ENCRYPTION_KEY: key,
          ALLOW_REGISTRATION: registration,
          HOST: "127.0.0.1",
          PORT: String(port),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (data) => {
        logs += data;
      });
      child.stderr.on("data", (data) => {
        logs += data;
      });
      for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null)
          throw new Error(`API startup failed: ${logs}`);
        try {
          const response = await fetch(`${base}/api/healthz`);
          if (response.ok) return;
        } catch {}
        await delay(100);
      }
      throw new Error("API did not become ready");
    };
    const stop = async () => {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exit = once(child, "exit");
        child.kill("SIGTERM");
        await exit;
      }
    };
    const request = async (
      path,
      method = "GET",
      body,
      actor = alice,
      extra = {},
    ) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(actor ? { authorization: `Bearer ${actor.accessToken}` } : {}),
          ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        headers: response.headers,
        body: response.status === 204 ? null : await response.json(),
      };
    };
    const register = async (email) => {
      const result = await request(
        "/api/auth/register",
        "POST",
        { email, password: "Synthetic-Strong-Password-42" },
        null,
      );
      assert.equal(result.status, 201);
      return result.body;
    };
    try {
      await start();
      await t.test("users and hashed sessions are persisted", async () => {
        alice = await register(
          `alice-${randomBytes(4).toString("hex")}@example.invalid`,
        );
        bob = await register(
          `bob-${randomBytes(4).toString("hex")}@example.invalid`,
        );
        const user = await connection
          .collection("users")
          .findOne({ _id: new mongoose.Types.ObjectId(alice.userId) });
        assert.match(user.passwordHash, /^scrypt:/);
        assert.ok(!user.passwordHash.includes("Synthetic-Strong"));
        const stored = await connection
          .collection("auth_sessions")
          .findOne({ userId: alice.userId });
        assert.ok(stored);
        assert.notEqual(stored.accessHash, alice.accessToken);
        assert.notEqual(stored.refreshHash, alice.refreshToken);
        assert.equal(
          (await request("/api/accounts", "GET", undefined, null)).status,
          401,
        );
      });
      await t.test(
        "device assignment validates ownership and is consistent with concurrent deletion",
        async () => {
          const grant = await request("/api/devices/pairing", "POST", {});
          const registered = await request(
            "/api/devices/register",
            "POST",
            { code: grant.body.code, name: "Concurrent fixture" },
            null,
          );
          assert.equal(registered.status, 201);
          const id = registered.body.device.id;
          for (const accountId of ["", " ", "not-an-id"])
            assert.equal(
              (
                await request(`/api/devices/${id}/assignment`, "PATCH", {
                  accountId,
                })
              ).status,
              400,
            );
          assert.equal(
            (
              await request(`/api/devices/${id}/assignment`, "PATCH", {
                accountId: "000000000000000000000001",
              })
            ).status,
            404,
          );
          const foreign = (
            await request("/api/accounts", "POST", { name: "Foreign" }, bob)
          ).body;
          assert.equal(
            (
              await request(`/api/devices/${id}/assignment`, "PATCH", {
                accountId: foreign.id,
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await request(
                `/api/accounts/${foreign.id}`,
                "DELETE",
                undefined,
                bob,
              )
            ).status,
            204,
          );
          for (let attempt = 0; attempt < 8; attempt++) {
            const account = (
              await request("/api/accounts", "POST", {
                name: "Concurrent deletion fixture",
              })
            ).body;
            const [assignment, deletion] = await Promise.all([
              request(`/api/devices/${id}/assignment`, "PATCH", {
                accountId: account.id,
              }),
              request(`/api/accounts/${account.id}`, "DELETE"),
            ]);
            assert.ok(
              [200, 404].includes(assignment.status),
              JSON.stringify(assignment),
            );
            assert.equal(deletion.status, 204);
            assert.equal(
              await connection.db.collection("accounts").countDocuments({
                _id: new mongoose.Types.ObjectId(account.id),
              }),
              0,
            );
            assert.equal(
              await connection.db
                .collection("companiondevices")
                .countDocuments({ accountId: account.id }),
              0,
            );
          }
          const oldAccount = (
            await request("/api/accounts", "POST", { name: "Old assignment" })
          ).body;
          const newAccount = (
            await request("/api/accounts", "POST", { name: "New assignment" })
          ).body;
          assert.equal(
            (
              await request(`/api/devices/${id}/assignment`, "PATCH", {
                accountId: oldAccount.id,
              })
            ).status,
            200,
          );
          const [moved, oldDeleted] = await Promise.all([
            request(`/api/devices/${id}/assignment`, "PATCH", {
              accountId: newAccount.id,
            }),
            request(`/api/accounts/${oldAccount.id}`, "DELETE"),
          ]);
          assert.equal(moved.status, 200);
          assert.equal(oldDeleted.status, 204);
          assert.equal(
            (await request("/api/devices")).body.find((d) => d.id === id)
              .accountId,
            newAccount.id,
          );
          assert.equal(
            (await request(`/api/accounts/${newAccount.id}`, "DELETE")).status,
            204,
          );
          const target = (
            await request("/api/accounts", "POST", {
              name: "Unique assignment fixture",
            })
          ).body;
          const secondGrant = await request("/api/devices/pairing", "POST", {});
          const second = (
            await request(
              "/api/devices/register",
              "POST",
              { code: secondGrant.body.code, name: "Second fixture" },
              null,
            )
          ).body.device.id;
          const competing = await Promise.all(
            [id, second].map((device) =>
              request(`/api/devices/${device}/assignment`, "PATCH", {
                accountId: target.id,
              }),
            ),
          );
          assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409]);
          assert.equal(
            await connection.db
              .collection("companiondevices")
              .countDocuments({ accountId: target.id }),
            1,
          );
          assert.equal(
            (await request(`/api/accounts/${target.id}`, "DELETE")).status,
            204,
          );
          assert.equal(
            await connection.db
              .collection("companiondevices")
              .countDocuments({ accountId: target.id }),
            0,
          );
        },
      );
      await t.test(
        "authenticated fleet heartbeats do not share an IP or interactive quota",
        async () => {
          const rows = Array.from({ length: 32 }, (_, i) => ({
            ownerId: alice.userId,
            name: `Fleet fixture ${i}`,
            token: randomBytes(32).toString("base64url"),
          }));
          const { createHash } = await import("node:crypto");
          await connection.db.collection("companiondevices").insertMany(
            rows.map(({ token, ...row }) => ({
              ...row,
              accountId: null,
              tokenHash: createHash("sha256").update(token).digest("hex"),
              tokenExpiresAt: new Date(Date.now() + 86400000),
            })),
          );
          const status = {
            batteryPercent: 70,
            charging: false,
            temperatureC: 25,
            androidVersion: "14",
            model: "Fleet fixture",
            captureActive: false,
            accessibilityEnabled: false,
          };
          for (const row of rows)
            for (let n = 0; n < 10; n++)
              assert.equal(
                (
                  await request("/api/devices/self/heartbeat", "POST", status, {
                    accessToken: row.token,
                  })
                ).status,
                200,
              );
          for (let n = 0; n < 2; n++)
            assert.equal(
              (
                await request("/api/devices/self/heartbeat", "POST", status, {
                  accessToken: rows[0].token,
                })
              ).status,
              200,
            );
          assert.equal(
            (
              await request("/api/devices/self/heartbeat", "POST", status, {
                accessToken: rows[0].token,
              })
            ).status,
            429,
          );
          assert.equal(
            (
              await request("/api/devices/self/heartbeat", "POST", status, {
                accessToken: rows[1].token,
              })
            ).status,
            200,
          );
          assert.equal((await request("/api/devices")).status, 200);
          let limited = false;
          for (let n = 0; n < 65; n++) {
            if ((await request("/api/devices")).status === 429) {
              limited = true;
              break;
            }
          }
          assert.equal(limited, true);
          assert.equal(
            (
              await request("/api/devices/self/heartbeat", "POST", status, {
                accessToken: rows[2].token,
              })
            ).status,
            200,
          );
          // A fresh API process resets volatile test rate-limit counters; database remains persistent.
          await stop();
          await start();
        },
      );
      await t.test(
        "companion pairing replay, ownership, rotation and revocation",
        async () => {
          const pairing = await request("/api/devices/pairing", "POST", {});
          assert.equal(pairing.status, 201);
          const registration = await request(
            "/api/devices/register",
            "POST",
            { code: pairing.body.code, name: "Fixture phone" },
            null,
          );
          assert.equal(registration.status, 201);
          const id = registration.body.device.id;
          const device = { accessToken: registration.body.token };
          assert.equal(
            (
              await request(
                "/api/devices/register",
                "POST",
                { code: pairing.body.code, name: "Replay" },
                null,
              )
            ).status,
            401,
          );
          assert.equal(
            (await request("/api/devices/self/heartbeat", "POST", {}, alice))
              .status,
            401,
          );
          assert.equal(
            (await request("/api/devices", "GET", undefined, device)).status,
            401,
          );
          assert.equal(
            (
              await request(
                `/api/devices/${id}/assignment`,
                "PATCH",
                { accountId: null },
                bob,
              )
            ).status,
            404,
          );
          const mine = await request("/api/accounts", "POST", {
            name: "Device account",
          });
          assert.equal(mine.status, 201);
          assert.equal(
            (
              await request(`/api/devices/${id}/assignment`, "PATCH", {
                accountId: mine.body.id,
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await request(`/api/devices/${id}/assignment`, "PATCH", {
                accountId: null,
              })
            ).body.accountId,
            null,
          );
          const status = {
            batteryPercent: 80,
            charging: true,
            temperatureC: 28.5,
            androidVersion: "14",
            model: "Fixture",
            captureActive: false,
            accessibilityEnabled: false,
          };
          assert.equal(
            (
              await request(
                "/api/devices/self/heartbeat",
                "POST",
                { ...status, batteryPercent: 101 },
                device,
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await request(
                "/api/devices/self/heartbeat",
                "POST",
                status,
                device,
              )
            ).body.online,
            true,
          );
          const raw = await connection.db
            .collection("companiondevices")
            .findOne({ _id: new mongoose.Types.ObjectId(id) });
          assert.notEqual(raw.tokenHash, device.accessToken);
          assert.equal(raw.tokenHash.length, 64);
          await connection.db
            .collection("companiondevices")
            .updateOne(
              { _id: new mongoose.Types.ObjectId(id) },
              { $set: { lastSeenAt: new Date(Date.now() - 100000) } },
            );
          assert.equal(
            (await request("/api/devices")).body.find((d) => d.id === id)
              .online,
            false,
          );
          const expired = await request("/api/devices/pairing", "POST", {});
          await connection.db.collection("devicepairings").updateOne(
            {
              codeHash: (await import("node:crypto"))
                .createHash("sha256")
                .update(expired.body.code)
                .digest("hex"),
            },
            { $set: { expiresAt: new Date(0) } },
          );
          assert.equal(
            (
              await request(
                "/api/devices/register",
                "POST",
                { code: expired.body.code, name: "Expired" },
                null,
              )
            ).status,
            401,
          );
          const rotation = await request(
            "/api/devices/self/rotate",
            "POST",
            {},
            device,
          );
          assert.equal(rotation.status, 200);
          assert.equal(
            (
              await request(
                "/api/devices/self/heartbeat",
                "POST",
                status,
                device,
              )
            ).status,
            401,
          );
          device.accessToken = rotation.body.token;
          assert.equal(
            (
              await request(
                "/api/devices/self/heartbeat",
                "POST",
                status,
                device,
              )
            ).status,
            200,
          );
          assert.equal(
            (await request(`/api/devices/${id}`, "DELETE", undefined, bob))
              .status,
            404,
          );
          assert.equal(
            (await request(`/api/devices/${id}`, "DELETE")).status,
            204,
          );
          assert.equal(
            (
              await request(
                "/api/devices/self/heartbeat",
                "POST",
                status,
                device,
              )
            ).status,
            401,
          );
        },
      );
      await t.test(
        "account secrets, browser state and images are encrypted at rest",
        async () => {
          const created = await request("/api/accounts", "POST", {
            name: "Persistent",
            surname: "Fixture",
            email: "vault@example.invalid",
            password: "Synthetic-Vault-Secret",
            walletName: "fixture",
            idNumber: "synthetic-id",
            image1: "data:image/png;base64,fixture",
          });
          assert.equal(created.status, 201);
          account = created.body;
          const raw = await connection
            .collection("accounts")
            .findOne({ _id: new mongoose.Types.ObjectId(account.id) });
          assert.match(raw.password, /^enc:v1:/);
          assert.match(raw.idNumber, /^enc:v1:/);
          assert.match(raw.image1, /^enc:v1:/);
          state = {
            cookies: { auth: "Synthetic-Cookie" },
            localStorage: { "persist.auth": "Synthetic-Storage" },
            sessionStorage: {},
            history: [],
          };
          assert.equal(
            (
              await request(
                `/api/accounts/${account.id}/browser-state`,
                "PATCH",
                state,
              )
            ).status,
            200,
          );
          const updated = await connection
            .collection("accounts")
            .findOne({ _id: raw._id });
          assert.match(updated.browserState, /^enc:v1:/);
          assert.ok(!JSON.stringify(updated).includes("Synthetic-Cookie"));
        },
      );
      await t.test(
        "another user cannot list/read/update/delete accounts or browser state",
        async () => {
          assert.deepEqual(
            (await request("/api/accounts", "GET", undefined, bob)).body,
            [],
          );
          for (const method of ["GET", "PUT", "PATCH", "DELETE"])
            assert.equal(
              (
                await request(
                  `/api/accounts/${account.id}`,
                  method,
                  ["PUT", "PATCH"].includes(method)
                    ? { name: "Stolen" }
                    : undefined,
                  bob,
                )
              ).status,
              404,
            );
          for (const method of ["GET", "PATCH", "DELETE"])
            assert.equal(
              (
                await request(
                  `/api/accounts/${account.id}/browser-state`,
                  method,
                  method === "PATCH" ? {} : undefined,
                  bob,
                )
              ).status,
              404,
            );
          assert.equal(
            (
              await request(`/api/accounts/${account.id}`, "PATCH", {
                ownerId: bob.userId,
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request(`/api/accounts/${account.id}`, "PATCH", {
                $set: { name: "Injected" },
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "data and sessions survive an API process restart",
        async () => {
          await stop();
          await start();
          assert.equal(
            (await request(`/api/accounts/${account.id}`)).body.password,
            "Synthetic-Vault-Secret",
          );
          assert.deepEqual(
            (await request(`/api/accounts/${account.id}/browser-state`)).body
              .localStorage,
            state.localStorage,
          );
          assert.equal((await request("/api/auth/me")).status, 200);
        },
      );
      let proxy;
      await t.test(
        "browser engine commands, frames and downloads enforce owner authorization before worker access",
        async () => {
          const prefix = `/api/accounts/${account.id}/browser`;
          for (const endpoint of [
            prefix,
            `${prefix}/frame`,
            `${prefix}/downloads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
          ]) {
            assert.equal(
              (await request(endpoint, "GET", undefined, bob)).status,
              404,
            );
            assert.equal(
              (await request(endpoint, "GET", undefined, null)).status,
              401,
            );
          }
          assert.equal((await request(prefix)).status, 503);
          assert.equal(
            (
              await request(`${prefix}/commands`, "POST", {
                action: "evaluate",
                text: "steal()",
              })
            ).status,
            400,
          );
          assert.equal(
            (await request(`${prefix}/commands`, "POST", { action: "tap" }))
              .status,
            400,
          );
          assert.equal(
            (await request(`${prefix}/profile`, "DELETE", undefined, bob))
              .status,
            404,
          );
        },
      );
      await t.test(
        "proxy credentials are encrypted and proxy ownership is enforced",
        async () => {
          const created = await request("/api/proxies", "POST", {
            name: "Fixture",
            type: "https",
            host: "proxy.example.invalid",
            port: 443,
            username: "Synthetic-Proxy-User",
            password: "Synthetic-Proxy-Secret",
          });
          assert.equal(created.status, 201);
          proxy = created.body;
          assert.equal(proxy.password, undefined);
          assert.equal(proxy.hasPassword, true);
          const raw = await connection
            .collection("proxies")
            .findOne({ _id: new mongoose.Types.ObjectId(proxy.id) });
          assert.match(raw.password, /^enc:v1:/);
          assert.match(raw.username, /^enc:v1:/);
          assert.equal(proxy.username, "Synthetic-Proxy-User");
          assert.deepEqual(
            (await request("/api/proxies", "GET", undefined, bob)).body,
            [],
          );
          for (const method of ["PATCH", "DELETE"])
            assert.equal(
              (
                await request(
                  `/api/proxies/${proxy.id}`,
                  method,
                  method === "PATCH" ? { enabled: false } : undefined,
                  bob,
                )
              ).status,
              404,
            );
          assert.equal(
            (
              await request(
                `/api/accounts/${account.id}`,
                "PATCH",
                { proxyId: proxy.id },
                bob,
              )
            ).status,
            404,
          );
          const bobAccount = (
            await request("/api/accounts", "POST", { name: "Bob" }, bob)
          ).body;
          assert.equal(
            (
              await request(
                `/api/accounts/${bobAccount.id}`,
                "PATCH",
                { proxyId: proxy.id },
                bob,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await request(`/api/accounts/${account.id}`, "PATCH", {
                proxyId: proxy.id,
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await request(
                `/api/proxy?accountId=${account.id}&url=https://example.com`,
              )
            ).status,
            503,
          );
          assert.equal(
            (
              await request(`/api/accounts/${account.id}`, "PATCH", {
                proxyId: null,
              })
            ).status,
            200,
          );
        },
      );
      await t.test(
        "SSRF encodings, forged browser cookies and account-crossing grants are blocked",
        async () => {
          for (const target of [
            "http://127.0.0.1",
            "http://2130706433",
            "http://169.254.169.254",
            "http://[::ffff:127.0.0.1]",
          ])
            assert.equal(
              (
                await request(
                  `/api/proxy?accountId=${account.id}&url=${encodeURIComponent(target)}`,
                )
              ).status,
              403,
            );
          const grant = (
            await request("/api/auth/browser-grant", "POST", {
              accountId: account.id,
            })
          ).body.grant;
          assert.equal(
            (
              await request(
                "/api/auth/browser-grant",
                "POST",
                { accountId: account.id },
                bob,
              )
            ).status,
            404,
          );
          const path = `/api/proxy?accountId=${account.id}&url=http://127.0.0.1&grant=${grant}`;
          const exchanged = await request(path, "GET", undefined, null);
          assert.equal(exchanged.status, 403);
          assert.match(exchanged.headers.get("set-cookie"), /HttpOnly/);
          assert.match(exchanged.headers.get("set-cookie"), /Secure/);
          assert.equal(
            (await request(path, "GET", undefined, null)).status,
            401,
          );
          const cookie = exchanged.headers.get("set-cookie").split(";")[0];
          assert.equal(
            (
              await request(
                `/api/proxy?accountId=${account.id}&url=http://127.0.0.1`,
                "GET",
                undefined,
                null,
                { cookie },
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await request(
                `/api/proxy?accountId=${account.id}&url=http://127.0.0.1`,
                "GET",
                undefined,
                null,
                { cookie: cookie + "bad" },
              )
            ).status,
            401,
          );
          await request("/api/auth/logout", "POST");
          assert.equal(
            (
              await request(
                `/api/proxy?accountId=${account.id}&url=http://127.0.0.1`,
                "GET",
                undefined,
                null,
                { cookie },
              )
            ).status,
            401,
          );
          assert.equal((await request("/api/auth/me")).status, 401);
          assert.equal(
            (
              await request(
                "/api/auth/refresh",
                "POST",
                { refreshToken: alice.refreshToken },
                null,
              )
            ).status,
            401,
          );
          const user = await connection
            .collection("users")
            .findOne({ _id: new mongoose.Types.ObjectId(alice.userId) });
          alice = (
            await request(
              "/api/auth/login",
              "POST",
              { email: user.email, password: "Synthetic-Strong-Password-42" },
              null,
            )
          ).body;
        },
      );
      await t.test(
        "refresh tokens rotate, and replayed/access-expired tokens fail",
        async () => {
          const old = alice;
          const refreshed = await request(
            "/api/auth/refresh",
            "POST",
            { refreshToken: old.refreshToken },
            null,
          );
          assert.equal(refreshed.status, 200);
          alice = refreshed.body;
          assert.equal(
            (await request("/api/auth/me", "GET", undefined, old)).status,
            401,
          );
          assert.equal(
            (
              await request(
                "/api/auth/refresh",
                "POST",
                { refreshToken: old.refreshToken },
                null,
              )
            ).status,
            401,
          );
          await connection
            .collection("auth_sessions")
            .updateMany(
              { userId: bob.userId },
              { $set: { expiresAt: new Date(0) } },
            );
          assert.equal(
            (await request("/api/auth/me", "GET", undefined, bob)).status,
            401,
          );
        },
      );
      await t.test(
        "disabled users cannot access, log in, or refresh",
        async () => {
          const email = `disabled-${randomBytes(4).toString("hex")}@example.invalid`;
          const disabled = await register(email);
          await connection
            .collection("users")
            .updateOne(
              { _id: new mongoose.Types.ObjectId(disabled.userId) },
              { $set: { disabled: true } },
            );
          assert.equal(
            (await request("/api/auth/me", "GET", undefined, disabled)).status,
            401,
          );
          assert.equal(
            (
              await request(
                "/api/auth/login",
                "POST",
                { email, password: "Synthetic-Strong-Password-42" },
                null,
              )
            ).status,
            401,
          );
          assert.equal(
            (
              await request(
                "/api/auth/refresh",
                "POST",
                { refreshToken: disabled.refreshToken },
                null,
              )
            ).status,
            401,
          );
        },
      );
      await t.test(
        "unowned legacy records are quarantined; migration defaults to dry-run",
        async () => {
          const id = new mongoose.Types.ObjectId();
          await connection.collection("accounts").insertOne({
            _id: id,
            name: "Legacy",
            password: "Synthetic-Legacy-Secret",
          });
          assert.equal((await request(`/api/accounts/${id}`)).status, 404);
          const run = async (apply) => {
            const args = [
              "--import",
              "tsx",
              "tools/migrate-owned-accounts.ts",
              "--owner-id",
              alice.userId,
              ...(apply ? ["--apply"] : []),
            ];
            const process = spawn(globalThis.process.execPath, args, {
              cwd: root,
              env: {
                ...globalThis.process.env,
                MONGODB_URI: uri,
                ACCOUNT_ENCRYPTION_KEY: key,
              },
              stdio: ["ignore", "pipe", "pipe"],
            });
            const [code] = await once(process, "exit");
            assert.equal(code, 0);
          };
          await run(false);
          assert.equal(
            (await connection.collection("accounts").findOne({ _id: id }))
              .ownerId,
            undefined,
          );
          await run(true);
          const migrated = await connection
            .collection("accounts")
            .findOne({ _id: id });
          assert.equal(migrated.ownerId, alice.userId);
          assert.match(migrated.password, /^enc:v1:/);
          assert.equal(
            (await request(`/api/accounts/${id}`)).body.password,
            "Synthetic-Legacy-Secret",
          );
        },
      );
      await t.test(
        "security headers, CORS, malformed/oversized input and safe errors",
        async () => {
          const health = await request("/api/healthz");
          assert.equal(health.headers.get("x-content-type-options"), "nosniff");
          assert.equal(health.headers.get("x-powered-by"), null);
          assert.equal(
            (
              await request("/api/accounts", "GET", undefined, alice, {
                origin: "https://evil.example",
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request("/api/accounts", "POST", {
                name: "x".repeat(6 * 1024 * 1024),
              })
            ).status,
            413,
          );
          const malformed = await fetch(`${base}/api/accounts`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${alice.accessToken}`,
              "content-type": "application/json",
            },
            body: "{",
          });
          assert.equal(malformed.status, 400);
          assert.ok(!(await malformed.text()).includes("stack"));
          const audits = await connection
            .collection("access_audit")
            .countDocuments();
          assert.ok(audits > 0);
        },
      );
      await t.test(
        "authentication rate limits cannot be bypassed by forged forwarding headers",
        async () => {
          let limited = false;
          for (let i = 0; i < 25; i++) {
            const result = await request(
              "/api/auth/login",
              "POST",
              {
                email: "absent@example.invalid",
                password: "Synthetic-Wrong-Password",
              },
              null,
              { "x-forwarded-for": `203.0.113.${i + 1}` },
            );
            if (result.status === 429) {
              limited = true;
              break;
            }
            assert.equal(result.status, 401);
          }
          assert.equal(limited, true);
        },
      );
      await t.test(
        "production registration can be disabled without locking out existing users",
        async () => {
          await stop();
          await start("false");
          assert.equal(
            (
              await request(
                "/api/auth/register",
                "POST",
                {
                  email: "blocked@example.invalid",
                  password: "Synthetic-Strong-Password-42",
                },
                null,
              )
            ).status,
            403,
          );
          assert.equal((await request("/api/auth/me")).status, 200);
        },
      );
    } finally {
      await stop();
      await connection.dropDatabase();
      await connection.close();
    }
  },
);
