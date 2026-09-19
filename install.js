"use strict";

// Progressive enhancement: installation support is optional and must never block study.
(function () {
  const installButton = document.getElementById("installButton");
  const iosInstallDialog = document.getElementById("iosInstallDialog");
  const closeInstallDialog = document.getElementById("closeInstallDialog");
  if (!installButton) return;

  let deferredPrompt = null;
  const userAgent = window.navigator?.userAgent || "";
  const platform = window.navigator?.platform || "";
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && Number(window.navigator?.maxTouchPoints) > 1);
  const isAndroid = /Android/i.test(userAgent);

  function isStandalone() {
    try {
      return Boolean(window.navigator?.standalone) ||
        Boolean(window.matchMedia?.("(display-mode: standalone)").matches);
    } catch (_) {
      return false;
    }
  }

  function updateVisibility() {
    const available = !isStandalone() && (isIOS || Boolean(deferredPrompt));
    installButton.hidden = !available;
    document.body?.classList?.toggle("install-available", available);
    if (!available) installButton.disabled = false;
  }

  function showIOSInstructions() {
    if (!iosInstallDialog) return;
    try {
      if (typeof iosInstallDialog.showModal === "function") iosInstallDialog.showModal();
      else iosInstallDialog.setAttribute("open", "");
    } catch (_) {
      // A browser without dialog support simply leaves the app usable.
    }
  }

  function closeIOSInstructions() {
    if (!iosInstallDialog) return;
    if (typeof iosInstallDialog.close === "function") iosInstallDialog.close();
    else iosInstallDialog.removeAttribute("open");
  }

  window.addEventListener("beforeinstallprompt", event => {
    // Android phones and tablets expose this event; desktop browsers do not get this control.
    if (!isAndroid || isStandalone()) return;
    event.preventDefault();
    deferredPrompt = event;
    updateVisibility();
  });

  installButton.addEventListener("click", async () => {
    if (isStandalone()) {
      updateVisibility();
      return;
    }
    if (!deferredPrompt) {
      if (isIOS) showIOSInstructions();
      return;
    }

    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    installButton.disabled = true;
    updateVisibility();
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (_) {
      // Cancellation or an unavailable prompt is non-fatal.
    } finally {
      installButton.disabled = false;
      updateVisibility();
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    updateVisibility();
  });

  if (closeInstallDialog && iosInstallDialog) {
    closeInstallDialog.addEventListener("click", closeIOSInstructions);
    iosInstallDialog.addEventListener("click", event => {
      if (event.target === iosInstallDialog) closeIOSInstructions();
    });
  }

  try {
    const displayMode = window.matchMedia?.("(display-mode: standalone)");
    displayMode?.addEventListener?.("change", updateVisibility);
  } catch (_) {
    // Display-mode detection is best effort only.
  }

  updateVisibility();
}());
