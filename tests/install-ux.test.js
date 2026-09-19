"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "install.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
assert.match(html, /id="installButton"[\s\S]*aria-label="Install app"/);
assert.match(html, /id="iosInstallDialog"[\s\S]*Install Japanese Flashcards/);
assert.ok(html.includes('<script src="install.js"></script>'));
assert.ok(html.includes('M12 3v11m0 0 4-4m-4 4-4-4M5 21h14'));
assert.ok(serviceWorker.includes('"japanese-flashcards:"'));
assert.ok(serviceWorker.includes('"./install.js"'));

function makeContext({ userAgent, platform = "", maxTouchPoints = 0, standalone = false, matchMedia = true } = {}) {
  const elements = new Map();
  const windowListeners = new Map();
  function element() {
    const listeners = new Map();
    return {
      hidden: true, disabled: false, open: false,
      setAttribute(name, value) { this[name] = value; },
      removeAttribute(name) { delete this[name]; },
      showModal() { this.open = true; },
      close() { this.open = false; },
      addEventListener(name, callback) { listeners.set(name, callback); },
      async click() { await listeners.get("click")?.({ target: this }); }
    };
  }
  const installButton = element();
  const iosDialog = element();
  const closeButton = element();
  elements.set("installButton", installButton);
  elements.set("iosInstallDialog", iosDialog);
  elements.set("closeInstallDialog", closeButton);
  const navigator = { userAgent, platform, maxTouchPoints, standalone };
  const window = {
    navigator,
    ...(matchMedia ? { matchMedia: () => ({ matches: standalone, addEventListener() {} }) } : {}),
    addEventListener(name, callback) { windowListeners.set(name, callback); }
  };
  const context = { window, document: { body: {}, getElementById(id) { return elements.get(id) || null; } } };
  vm.createContext(context);
  vm.runInContext(script, context);
  return { installButton, iosDialog, closeButton, dispatch(name, event) { return windowListeners.get(name)?.(event); } };
}

(async () => {
  const android = makeContext({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) Chrome/140 Mobile Safari/537.36" });
  assert.equal(android.installButton.hidden, true);
  let prevented = false;
  let promptCalled = false;
  android.dispatch("beforeinstallprompt", {
    preventDefault() { prevented = true; },
    async prompt() { promptCalled = true; },
    userChoice: Promise.resolve({ outcome: "accepted" })
  });
  assert.equal(prevented, true);
  assert.equal(android.installButton.hidden, false);
  await android.installButton.click();
  assert.equal(promptCalled, true);
  assert.equal(android.installButton.hidden, true);

  const canceled = makeContext({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140 Mobile Safari/537.36" });
  canceled.dispatch("beforeinstallprompt", {
    preventDefault() {},
    async prompt() {},
    userChoice: Promise.resolve({ outcome: "dismissed" })
  });
  await canceled.installButton.click();
  assert.equal(canceled.installButton.hidden, true, "canceling the native prompt must be harmless");

  const desktop = makeContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/140 Safari/537.36", platform: "MacIntel" });
  let desktopPrevented = false;
  desktop.dispatch("beforeinstallprompt", { preventDefault() { desktopPrevented = true; } });
  assert.equal(desktop.installButton.hidden, true);
  assert.equal(desktopPrevented, false);

  const iphone = makeContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" });
  assert.equal(iphone.installButton.hidden, false);
  await iphone.installButton.click();
  assert.equal(iphone.iosDialog.open, true);
  await iphone.closeButton.click();
  assert.equal(iphone.iosDialog.open, false);

  const ipad = makeContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 });
  assert.equal(ipad.installButton.hidden, false);

  const standalone = makeContext({ userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile Safari/537.36", standalone: true });
  assert.equal(standalone.installButton.hidden, true);
  standalone.dispatch("appinstalled", {});
  assert.equal(standalone.installButton.hidden, true);

  const unsupported = makeContext({ userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile Safari/537.36", matchMedia: false });
  assert.equal(unsupported.installButton.hidden, true);

  console.log("Install UX tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
