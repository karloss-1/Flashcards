"use strict";
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js", {scope:"./"}).catch(() => { document.getElementById("status").textContent = "Offline setup failed. Reconnect and reload to try again."; }));
