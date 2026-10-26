import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { remoteViewerHtml } from "../../mobile/lib/remote-viewer.ts";

test("viewer receives real WebRTC video, reports quality and supports ICE restart and stop", async () => {
  const ice = process.env.WEBRTC_TEST_ICE_FILE
    ? JSON.parse(readFileSync(process.env.WEBRTC_TEST_ICE_FILE, "utf8"))
    : [];
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.messages = [];
      window.ReactNativeWebView = {
        postMessage: (m) => window.messages.push(JSON.parse(m)),
      };
    });
    // setContent does not execute addInitScript, so initialize the native bridge explicitly.
    await page.evaluate(() => {
      window.messages = [];
      window.ReactNativeWebView = {
        postMessage: (m) => window.messages.push(JSON.parse(m)),
      };
    });
    page.on("pageerror", (e) => console.log("Viewer error:", e.message));
    page.on("console", (m) => {
      if (m.type() === "error") console.log("Viewer console:", m.text());
    });
    await page.setContent(remoteViewerHtml);
    await page.evaluate(async (ice) => {
      window.sender = new RTCPeerConnection({ iceServers: ice });
      const canvas = document.createElement("canvas");
      canvas.width = 360;
      canvas.height = 640;
      const ctx = canvas.getContext("2d");
      window.paint = setInterval(() => {
        ctx.fillStyle = "rgb(" + (Date.now() % 255) + ",70,140)";
        ctx.fillRect(0, 0, 360, 640);
      }, 50);
      canvas
        .captureStream(20)
        .getTracks()
        .forEach((t) => sender.addTrack(t));
      window.remoteStart(ice);
    }, ice);
    async function negotiate() {
      await page.waitForFunction(() =>
        window.messages.some((m) => m.type === "signal"),
      );
      // Wait for host candidates and exchange full snapshots, as the authenticated API does.
      await page.waitForTimeout(600);
      const offer = await page.evaluate(
        () => window.messages.filter((m) => m.type === "signal").at(-1).data,
      );
      const answer = await page.evaluate(async (offer) => {
        await sender.setRemoteDescription({ type: "offer", sdp: offer.sdp });
        for (const c of offer.candidates) await sender.addIceCandidate(c);
        window.answerCandidates = [];
        sender.onicecandidate = (e) => {
          if (e.candidate) answerCandidates.push(e.candidate.toJSON());
        };
        const answer = await sender.createAnswer();
        await sender.setLocalDescription(answer);
        return answer.sdp;
      }, offer);
      let sent = offer.candidates.length;
      for (let attempt = 0; attempt < 100; attempt++) {
        const current = await page.evaluate(
          (g) =>
            messages
              .filter((m) => m.type === "signal" && m.data.generation === g)
              .at(-1).data,
          offer.generation,
        );
        await page.evaluate(async (value) => {
          for (const c of value) await sender.addIceCandidate(c);
        }, current.candidates.slice(sent));
        sent = current.candidates.length;
        const candidates = await page.evaluate(() => answerCandidates);
        await page.evaluate((state) => window.remoteUpdate(state), {
          signal: { generation: offer.generation, sdp: answer, candidates },
        });
        if (
          await page.evaluate(
            () =>
              document.querySelector("video").videoWidth === 360 &&
              pc.connectionState === "connected",
          )
        )
          return;
        await page.waitForTimeout(100);
      }
      const diagnostic = await page.evaluate(() => ({
        receiver: pc.connectionState,
        sender: sender.connectionState,
        candidates: messages.filter((m) => m.type === "signal").at(-1)?.data
          .candidates.length,
        answerCandidates: answerCandidates.length,
        videoWidth: document.querySelector("video").videoWidth,
      }));
      assert.fail("Media not received: " + JSON.stringify(diagnostic));
    }
    await negotiate();
    await page.waitForFunction(() =>
      window.messages.some(
        (m) => m.type === "status" && m.data.includes("fps"),
      ),
    );
    await page.evaluate(() => {
      window.messages = [];
      return offer();
    });
    await negotiate();
    // Pointer coordinates exclude letterboxing; actual input must traverse API ownership checks.
    await page.locator("video").click();
    assert.ok(
      await page.evaluate(() =>
        window.messages.some(
          (m) => m.type === "command" && m.data.type === "tap",
        ),
      ),
    );
    await page.evaluate(() => {
      window.remoteStop();
      sender.close();
      clearInterval(paint);
    });
    assert.equal(
      await page.evaluate(() => document.querySelector("video").srcObject),
      null,
    );
  } finally {
    await browser.close();
  }
});
