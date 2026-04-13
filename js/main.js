import { state } from "./state.js";
import { parseEmployeeQR, parseFabricationItemQR, groupItemsByChiller } from "./qr.js";
import {
  startBatchRun,
  holdBatchRun,
  resumeBatchRun,
  completeBatchRun
} from "./fabricationRuns.js";

/* =========================
   DOM
========================= */
const readerEl = document.getElementById("reader");
const startScanBtn = document.getElementById("start-scan");
const scanStatusEl = document.getElementById("scan-status");

const screenEmployee = document.getElementById("screen-employee");
const screenItems = document.getElementById("screen-items");
const screenStatus = document.getElementById("screen-status");

const stepFill = document.getElementById("stepFill");
const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");

const empName = document.getElementById("empName");
const empNo = document.getElementById("empNo");
const empStation = document.getElementById("empStation");
const manpowerInput = document.getElementById("manpowerInput");

const itemCount = document.getElementById("itemCount");
const itemList = document.getElementById("itemList");

const statusEmployee = document.getElementById("statusEmployee");
const statusEmpNo = document.getElementById("statusEmpNo");
const statusStation = document.getElementById("statusStation");
const statusManpower = document.getElementById("statusManpower");
const statusTotalItems = document.getElementById("statusTotalItems");
const statusTotalProjects = document.getElementById("statusTotalProjects");
const groupedItemsEl = document.getElementById("groupedItems");

const processSelect = document.getElementById("processSelect");
const stopwatchEl = document.getElementById("stopwatch");
const runMeta = document.getElementById("runMeta");

const toItemsBtn = document.getElementById("to-items");
const toStatusBtn = document.getElementById("to-status");
const clearItemsBtn = document.getElementById("btnClearItems");

const btnStartProcess = document.getElementById("btnStartProcess");
const btnStopProcess = document.getElementById("btnStopProcess");
const btnHoldProcess = document.getElementById("btnHoldProcess");

const holdModal = document.getElementById("holdModal");
const holdReason = document.getElementById("holdReason");
const holdRemarks = document.getElementById("holdRemarks");
const holdRemarksLabel = document.getElementById("holdRemarksLabel");
const holdCancel = document.getElementById("holdCancel");
const holdSave = document.getElementById("holdSave");

const completeModal = document.getElementById("completeModal");
const completeCancel = document.getElementById("completeCancel");
const completeConfirm = document.getElementById("completeConfirm");

const saveOverlay = document.getElementById("saveOverlay");
const saveOverlayText = document.getElementById("saveOverlayText");

/* =========================
   SCANNER
========================= */
let html5QrCode = null;
let isScannerRunning = false;
let scanLock = false;
let lastScanText = "";
let lastScanAt = 0;

function getActiveScreen() {
  if (!screenEmployee.classList.contains("hidden")) return "employee";
  if (!screenItems.classList.contains("hidden")) return "items";
  return "status";
}

function getQrboxSize() {
  const w = Math.min(window.innerWidth || 360, 480);
  return Math.max(220, Math.floor(w * 0.65));
}

async function startScanner() {
  if (isScannerRunning) return;

  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader");
  }

  await html5QrCode.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: { width: getQrboxSize(), height: getQrboxSize() },
      aspectRatio: 1.0,
      rememberLastUsedCamera: true
    },
    onScanSuccess,
    () => {}
  );

  isScannerRunning = true;
  setScanStatus("Scanner started.", "info");
  startScanBtn.textContent = "Stop Scan";
}

async function stopScanner() {
  if (!html5QrCode || !isScannerRunning) return;

  await html5QrCode.stop();
  await html5QrCode.clear();
  isScannerRunning = false;
  startScanBtn.textContent = "Scan QR Code";
  setScanStatus("Scanner stopped.", "info");
}

async function toggleScanner() {
  try {
    if (isScannerRunning) {
      await stopScanner();
    } else {
      await startScanner();
    }
  } catch (err) {
    setScanStatus(err.message || "Unable to access camera.", "err");
  }
}

async function onScanSuccess(decodedText) {
  const now = Date.now();

  if (scanLock) return;
  if (decodedText === lastScanText && now - lastScanAt < 1500) return;

  scanLock = true;
  lastScanText = decodedText;
  lastScanAt = now;

  try {
    const active = getActiveScreen();

    if (active === "employee") {
      handleEmployeeScan(decodedText);
      await stopScanner();
    } else if (active === "items") {
      handleItemScan(decodedText);
    }
  } finally {
    setTimeout(() => {
      scanLock = false;
    }, 500);
  }
}

/* =========================
   UI HELPERS
========================= */

function resetAppToFirstPage(statusMessage = "Ready to scan employee QR.", statusType = "info") {
  stopScanner().catch(() => {});

  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }

  state.employeeData = null;
  state.scannedItems = [];
  state.groupedItems = [];
  state.activeBatchSessionId = null;
  state.activeRunDocs = [];
  state.runRunning = false;
  state.runAccumMs = 0;
  state.runStartEpoch = null;
  state.currentStatus = "idle";

  manpowerInput.value = "";
  processSelect.value = "";
  holdReason.value = "";
  holdRemarks.value = "";

  runMeta.textContent = "No active batch session";

  renderEmployee();
  renderItemList();
  renderStopwatch();
  updateActionButtons();

  closeHoldModal();
  closeCompleteModal();
  toggleHoldRemarks();

  showScreen("employee");
  startTimerLoop();
  setScanStatus(statusMessage, statusType);
}

function showOverlay(text = "Saving...") {
  saveOverlayText.textContent = text;
  saveOverlay.classList.remove("hidden");
}

function hideOverlay() {
  saveOverlay.classList.add("hidden");
}

function setScanStatus(message, type = "info") {
  scanStatusEl.textContent = message;
  scanStatusEl.classList.remove("hidden", "ok", "err", "info");
  scanStatusEl.classList.add(type);
}

function showScreen(screenName) {
  screenEmployee.classList.add("hidden");
  screenItems.classList.add("hidden");
  screenStatus.classList.add("hidden");

  step1.classList.remove("current", "done");
  step2.classList.remove("current", "done");
  step3.classList.remove("current", "done");

  if (screenName === "employee") {
    screenEmployee.classList.remove("hidden");
    step1.classList.add("current");
    stepFill.style.width = "0%";
  }

  if (screenName === "items") {
    screenItems.classList.remove("hidden");
    step1.classList.add("done");
    step2.classList.add("current");
    stepFill.style.width = "50%";
  }

  if (screenName === "status") {
    screenStatus.classList.remove("hidden");
    step1.classList.add("done");
    step2.classList.add("done");
    step3.classList.add("current");
    stepFill.style.width = "100%";
  }
}

function renderEmployee() {
  empName.textContent = state.employeeData?.employeeName || "-";
  empNo.textContent = state.employeeData?.employeeNumber || "-";
  empStation.textContent = state.employeeData?.station || "-";
}

function renderItemList() {
  itemCount.textContent = String(state.scannedItems.length);

  if (!state.scannedItems.length) {
    itemList.innerHTML = `<div class="hint">No items scanned yet.</div>`;
    return;
  }

  itemList.innerHTML = state.scannedItems.map((item, idx) => `
    <div class="itemCard">
      <div class="itemCardTop">
        <div class="itemTitle">${idx + 1}. ${escapeHtml(item.itemID)}</div>
        <button type="button" class="btnDanger itemRemoveBtn" data-index="${idx}" style="max-width:90px; padding:8px 10px; font-size:13px;">Remove</button>
      </div>
      <div class="itemMeta">
        <div><b>Project:</b> ${escapeHtml(item.projectName)}</div>
        <div><b>Serial:</b> ${escapeHtml(item.chillerSerialNumber)}</div>
        <div><b>Description:</b> ${escapeHtml(item.description)} <span class="laneTag">${escapeHtml(item.laneType)}</span></div>
      </div>
    </div>
  `).join("");

  document.querySelectorAll(".itemRemoveBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      state.scannedItems.splice(idx, 1);
      renderItemList();
      setScanStatus("Item removed.", "info");
    });
  });
}

function renderStatusSummary() {
  const grouped = groupItemsByChiller(state.scannedItems);

  statusEmployee.textContent = state.employeeData?.employeeName || "-";
  statusEmpNo.textContent = state.employeeData?.employeeNumber || "-";
  statusStation.textContent = state.employeeData?.station || "-";
  statusManpower.textContent = state.employeeData?.manpower ?? "-";
  statusTotalItems.textContent = String(state.scannedItems.length || 0);
  statusTotalProjects.textContent = String(grouped.length || 0);

  if (!grouped.length) {
    groupedItemsEl.innerHTML = `<div class="hint">No grouped items.</div>`;
    return;
  }

  groupedItemsEl.innerHTML = grouped.map(group => `
    <div class="groupBlock">
      <div class="groupHead">${escapeHtml(group.projectName)} — ${escapeHtml(group.chillerSerialNumber)}</div>
      <div class="groupItems">
        ${group.items.map(item => `
          <div class="groupItem">
            • ${escapeHtml(item.itemID)} — ${escapeHtml(item.description)}
            <span class="laneTag">${escapeHtml(item.laneType)}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
}

function renderStopwatch() {
  const base = state.runAccumMs;
  const runningMs = state.runRunning && state.runStartEpoch ? (Date.now() - state.runStartEpoch) : 0;
  const totalMs = base + runningMs;

  const totalSec = Math.floor(totalMs / 1000);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");

  stopwatchEl.textContent = `${hh}:${mm}:${ss}`;
}

function updateActionButtons() {
  const hasBatch = Array.isArray(state.activeRunDocs) && state.activeRunDocs.length > 0;

  btnStartProcess.disabled = hasBatch;
  btnHoldProcess.disabled = !hasBatch || state.currentStatus !== "running";
  btnStopProcess.disabled = !hasBatch || (state.currentStatus !== "running" && state.currentStatus !== "on_hold");
}

function startTimerLoop() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(renderStopwatch, 1000);
}

function isDuplicateItem(newItem) {
  return state.scannedItems.some(item =>
    String(item.itemID).trim().toUpperCase() === String(newItem.itemID).trim().toUpperCase()
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* =========================
   SCAN HANDLERS
========================= */
function handleEmployeeScan(decodedText) {
  const employee = parseEmployeeQR(decodedText);
  state.employeeData = employee;
  renderEmployee();
  setScanStatus(`Employee scanned: ${employee.employeeName}`, "ok");
}

function handleItemScan(decodedText) {
  if (state.scannedItems.length >= 20) {
    setScanStatus("Maximum 20 items per batch session.", "err");
    return;
  }

  const item = parseFabricationItemQR(decodedText);

  if (isDuplicateItem(item)) {
    setScanStatus(`Duplicate blocked: ${item.itemID}`, "err");
    return;
  }

  state.scannedItems.push(item);
  renderItemList();
  setScanStatus(`Added item ${item.itemID}`, "ok");
}

/* =========================
   MODALS
========================= */
function openHoldModal() {
  holdModal.classList.remove("hidden");
}

function closeHoldModal() {
  holdModal.classList.add("hidden");
}

function openCompleteModal() {
  completeModal.classList.remove("hidden");
}

function closeCompleteModal() {
  completeModal.classList.add("hidden");
}

function toggleHoldRemarks() {
  const needsRemarks = holdReason.value === "others";
  holdRemarks.classList.toggle("hidden", !needsRemarks);
  holdRemarksLabel.classList.toggle("hidden", !needsRemarks);
}

/* =========================
   EVENTS
========================= */
startScanBtn.addEventListener("click", toggleScanner);

toItemsBtn.addEventListener("click", () => {
  if (!state.employeeData) {
    setScanStatus("Please scan employee QR first.", "err");
    return;
  }

  const manpower = Number(manpowerInput.value);
  if (!Number.isFinite(manpower) || manpower <= 0) {
    setScanStatus("Please enter valid manpower.", "err");
    manpowerInput.focus();
    return;
  }

  state.employeeData.manpower = manpower;
  showScreen("items");
  setScanStatus("Now scan fabrication items.", "info");
});

clearItemsBtn.addEventListener("click", () => {
  state.scannedItems = [];
  renderItemList();
  setScanStatus("All scanned items cleared.", "info");
});

toStatusBtn.addEventListener("click", async () => {
  if (!state.scannedItems.length) {
    setScanStatus("Please scan at least 1 item.", "err");
    return;
  }

  if (isScannerRunning) {
    await stopScanner();
  }

  renderStatusSummary();
  showScreen("status");
  setScanStatus("Review batch and choose process.", "info");
});

btnStartProcess.addEventListener("click", async () => {
  try {
    if (!processSelect.value) {
      setScanStatus("Please select process first.", "err");
      return;
    }

    showOverlay("Starting process...");
    const result = await startBatchRun(processSelect.value);
    runMeta.textContent = `Batch: ${result.batchSessionId} | Runs created: ${result.activeRunDocs.length}`;
    updateActionButtons();
    renderStopwatch();
    setScanStatus("Batch run started.", "ok");
  } catch (err) {
    setScanStatus(err.message || "Unable to start process.", "err");
  } finally {
    hideOverlay();
  }
});

btnHoldProcess.addEventListener("click", () => {
  holdReason.value = "";
  holdRemarks.value = "";
  toggleHoldRemarks();
  openHoldModal();
});

holdReason.addEventListener("change", toggleHoldRemarks);

holdCancel.addEventListener("click", closeHoldModal);

holdSave.addEventListener("click", async () => {
  try {
    const reason = holdReason.value;
    const remarks = holdRemarks.value.trim();

    if (!reason) {
      setScanStatus("Please select hold reason.", "err");
      return;
    }

    if (reason === "others" && !remarks) {
      setScanStatus("Remarks are required for Others.", "err");
      return;
    }

    showOverlay("Saving hold...");
    await holdBatchRun(reason, remarks);
    closeHoldModal();
    resetAppToFirstPage("Batch run placed on hold.", "ok");
  } catch (err) {
    setScanStatus(err.message || "Unable to save hold.", "err");
  } finally {
    hideOverlay();
  }
});

btnStopProcess.addEventListener("click", () => {
  openCompleteModal();
});

completeCancel.addEventListener("click", closeCompleteModal);

completeConfirm.addEventListener("click", async () => {
  try {
    showOverlay("Completing process...");
    await completeBatchRun();
    closeCompleteModal();
    resetAppToFirstPage("Batch run completed.", "ok");
  } catch (err) {
    setScanStatus(err.message || "Unable to complete process.", "err");
  } finally {
    hideOverlay();
  }
});


btnStartProcess.addEventListener("dblclick", async () => {
  try {
    if (state.currentStatus !== "on_hold") return;
    showOverlay("Resuming process...");
    await resumeBatchRun();
    updateActionButtons();
    renderStopwatch();
    setScanStatus("Batch run resumed.", "ok");
  } catch (err) {
    setScanStatus(err.message || "Unable to resume process.", "err");
  } finally {
    hideOverlay();
  }
});

/* =========================
   INIT
========================= */
showScreen("employee");
renderEmployee();
renderItemList();
renderStopwatch();
updateActionButtons();
startTimerLoop();
setScanStatus("Ready to scan employee QR.", "info");