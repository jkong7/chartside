document.getElementById("allow").addEventListener("click", async () => {
  const msg = document.getElementById("msg");
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    msg.textContent = "Done. You can close this tab and record from the side panel.";
    setTimeout(() => window.close(), 1200);
  } catch {
    msg.textContent = "Chrome blocked the microphone. Allow it from the address bar, then try again.";
  }
});
