import { test, expect } from "@playwright/test";

const project = {
  version: 1, bpm: 120, timeSig: 4, grid: 0.25,
  loop: { enabled: false, start: 0, end: 4 },
  effects: { reverb: 0.73, delay: 0.15, chorus: 0, eqLow: 0, eqMid: 0, eqHigh: 0, dist: 0, comp: 0.3 },
  tracks: [{ id: "t2", name: "Track <b>1</b>", instrument: "Drums (TR-808)", color: "#123abc",
    volume: 0.7, pan: 0, mute: false, solo: false,
    notes: [{ id: "n1", pitch: 60, start: 1.5, duration: 0.25, velocity: 0.8 }] }]
};

const openProject = (page, data) => page.locator("#fileInput").setInputFiles({
  name: "project.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data))
});

test("読込失敗時に編集中トラックを保持し、有効な読込では設定を復元する", async ({ page }) => {
  await page.goto("/");
  await page.locator("#btnAddTrack").click();
  const invalid = structuredClone(project);
  delete invalid.tracks[0].notes;
  const dialog = page.waitForEvent("dialog");
  await openProject(page, invalid);
  const alert = await dialog;
  expect(alert.message()).toContain("読込失敗");
  await alert.accept();
  await expect(page.locator(".track-item")).toHaveCount(2);
  await openProject(page, project);
  await expect(page.locator(".track-item")).toHaveCount(1);
  await expect(page.locator(".track-item .name")).toHaveText("Track <b>1</b>");
  await expect(page.locator(".track-item b")).toHaveCount(0);
  await expect(page.locator("#fxReverb")).toHaveValue("0.73");
  await expect(page.locator("#btnToggleLoop")).toHaveText("ループ OFF");
  await page.locator("#btnAddTrack").click();
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return new Set(state.tracks.map(t => t.id)).size;
  })).toBe(2);
});

test("保存→再読込→再生：保存値、拍単位のループ、ループOFF、停止を確認する", async ({ page }) => {
  await page.goto("/");
  await openProject(page, project);
  await expect(page.locator("#fxReverb")).toHaveValue("0.73");
  await page.locator("#btnSave").click();
  await page.reload();
  await expect(page.locator("#fxReverb")).toHaveValue("0.73");
  await page.locator("#btnPlay").click();
  await expect(page.locator("#recStatus")).toHaveText("再生中");
  const timing = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const { Transport } = globalThis.Tone;
    const part = state.tracks[0].part;
    return { loop: Transport.loop, loopEnd: Transport.loopEnd, partLoop: part.loop,
      noteTime: part.at(`${1.5 * Transport.PPQ}i`).value.time };
  });
  expect(timing).toEqual({ loop: false, loopEnd: 2, partLoop: false, noteTime: "288i" });
  await page.getByRole("button", { name: "■ 停止", exact: true }).first().click();
  await expect(page.locator("#recStatus")).toHaveText("待機中");
});

test("マイク拒否後に再試行でき、停止時に取得した音声トラックを解放する", async ({ page }) => {
  await page.addInitScript(() => {
    let requests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      if (requests++ === 0) throw new Error("permission denied");
      const context = new AudioContext();
      const stream = context.createMediaStreamDestination().stream;
      window.recordingTestStream = stream;
      const track = stream.getAudioTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => { stop(); void context.close(); };
      return stream;
    };
  });
  await page.goto("/");
  await page.locator("#btnRecord").click();
  await expect(page.locator("#recStatus")).toContainText("マイク取得失敗");
  await page.locator("#btnRecord").click();
  await expect(page.locator("#recStatus")).toHaveText("録音中...");
  await page.locator("#btnRecord").click();
  await expect(page.locator("#recStatus")).toContainText("録音完了");
  expect(await page.evaluate(() => window.recordingTestStream.getAudioTracks()[0].readyState)).toBe("ended");
});

test("権限待ちの二重開始を防ぎ、プロジェクト切替後に届いたマイクを解放する", async ({ page }) => {
  await page.addInitScript(() => {
    window.microphoneRequests = 0;
    navigator.mediaDevices.getUserMedia = () => {
      window.microphoneRequests++;
      return new Promise(resolve => {
        window.allowTestMicrophone = () => {
          const context = new AudioContext();
          const stream = context.createMediaStreamDestination().stream;
          const track = stream.getAudioTracks()[0];
          const stop = track.stop.bind(track);
          track.stop = () => { stop(); void context.close(); };
          window.cancelledMicrophoneTrack = track;
          resolve(stream);
        };
      });
    };
  });
  await page.goto("/");
  const record = page.locator("#btnRecord");
  await record.click();
  await expect(record).toBeDisabled();
  await record.dispatchEvent("click");
  await expect.poll(() => page.evaluate(() => window.microphoneRequests)).toBe(1);
  await openProject(page, project);
  await expect(record).toBeEnabled();
  await page.evaluate(() => window.allowTestMicrophone());
  await expect.poll(() => page.evaluate(() => window.cancelledMicrophoneTrack.readyState)).toBe("ended");
  await expect(page.locator("#recStatus")).toHaveText("待機中");
});
