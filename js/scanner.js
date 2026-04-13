let employeeScanner = null;
let itemScanner = null;
let employeeScannerRunning = false;
let itemScannerRunning = false;

function getQrboxSize() {
  const w = Math.min(window.innerWidth || 360, 480);
  return Math.max(220, Math.floor(w * 0.65));
}

function buildConfig() {
  return {
    fps: 10,
    qrbox: { width: getQrboxSize(), height: getQrboxSize() },
    aspectRatio: 1.0,
    rememberLastUsedCamera: true
  };
}

export async function startEmployeeScanner(onSuccess) {
  if (employeeScannerRunning) return;
  if (!employeeScanner) {
    employeeScanner = new Html5Qrcode("employeeScanner");
  }

  await employeeScanner.start(
    { facingMode: "environment" },
    buildConfig(),
    async (decodedText) => {
      await stopEmployeeScanner();
      onSuccess(decodedText);
    },
    () => {}
  );

  employeeScannerRunning = true;
}

export async function stopEmployeeScanner() {
  if (!employeeScanner || !employeeScannerRunning) return;
  await employeeScanner.stop();
  await employeeScanner.clear();
  employeeScannerRunning = false;
}

export async function startItemScanner(onSuccess) {
  if (itemScannerRunning) return;
  if (!itemScanner) {
    itemScanner = new Html5Qrcode("itemScanner");
  }

  await itemScanner.start(
    { facingMode: "environment" },
    buildConfig(),
    async (decodedText) => {
      onSuccess(decodedText);
    },
    () => {}
  );

  itemScannerRunning = true;
}

export async function stopItemScanner() {
  if (!itemScanner || !itemScannerRunning) return;
  await itemScanner.stop();
  await itemScanner.clear();
  itemScannerRunning = false;
}