import { state } from "./state.js";
import { groupItemsByChiller } from "./qr.js";

const els = {
  stepEmployee: document.getElementById("stepEmployee"),
  stepItems: document.getElementById("stepItems"),
  stepReview: document.getElementById("stepReview"),

  employeePreview: document.getElementById("employeePreview"),
  itemList: document.getElementById("itemList"),
  itemCount: document.getElementById("itemCount"),
  groupedItems: document.getElementById("groupedItems"),
  timerDisplay: document.getElementById("timerDisplay"),
  runMeta: document.getElementById("runMeta"),
  statusText: document.getElementById("statusText"),

  btnStart: document.getElementById("btnStart"),
  btnHold: document.getElementById("btnHold"),
  btnResume: document.getElementById("btnResume"),
  btnComplete: document.getElementById("btnComplete")
};

export function showStep(stepNo) {
  els.stepEmployee.classList.remove("active");
  els.stepItems.classList.remove("active");
  els.stepReview.classList.remove("active");

  if (stepNo === 1) els.stepEmployee.classList.add("active");
  if (stepNo === 2) els.stepItems.classList.add("active");
  if (stepNo === 3) els.stepReview.classList.add("active");
}

export function renderEmployee() {
  const e = state.employeeData;
  if (!e) {
    els.employeePreview.innerHTML = "";
    return;
  }

  els.employeePreview.innerHTML = `
    <div><strong>Name:</strong> ${e.employeeName}</div>
    <div><strong>Employee No:</strong> ${e.employeeNumber}</div>
    <div><strong>Station:</strong> ${e.station}</div>
  `;
}

export function renderItems() {
  els.itemCount.textContent = `${state.scannedItems.length} / 20 items`;

  if (!state.scannedItems.length) {
    els.itemList.innerHTML = `<div class="metaText">No items scanned yet.</div>`;
    return;
  }

  els.itemList.innerHTML = state.scannedItems.map((item, idx) => `
    <div class="itemCard">
      <div class="itemListRow">
        <div>
          <div><strong>${idx + 1}. ${item.itemID}</strong></div>
          <div>${item.projectName} | ${item.chillerSerialNumber}</div>
          <div>${item.description} <span class="codeTag">${item.laneType}</span></div>
        </div>
        <button data-remove-index="${idx}" class="secondary">Remove</button>
      </div>
    </div>
  `).join("");

  document.querySelectorAll("[data-remove-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.removeIndex);
      state.scannedItems.splice(idx, 1);
      renderItems();
    });
  });
}

export function renderGroupedItems() {
  state.groupedItems = groupItemsByChiller(state.scannedItems);

  if (!state.groupedItems.length) {
    els.groupedItems.innerHTML = `<div class="metaText">No grouped items to show.</div>`;
    return;
  }

  els.groupedItems.innerHTML = state.groupedItems.map(group => `
    <div class="groupCard">
      <div><strong>${group.projectName}</strong> — ${group.chillerSerialNumber}</div>
      <div style="margin-top:8px;">
        ${group.items.map(item => `
          <div>• ${item.itemID} — ${item.description} <span class="codeTag">${item.laneType}</span></div>
        `).join("")}
      </div>
    </div>
  `).join("");
}

export function renderTimer() {
  const base = state.runAccumMs;
  const runningMs = state.runRunning && state.runStartEpoch ? (Date.now() - state.runStartEpoch) : 0;
  const totalMs = base + runningMs;

  const totalSec = Math.floor(totalMs / 1000);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");

  els.timerDisplay.textContent = `${hh}:${mm}:${ss}`;
}

export function setStatusText(text) {
  els.statusText.textContent = text;
}

export function setRunMeta(text) {
  els.runMeta.textContent = text;
}

export function updateActionButtons() {
  const hasBatch = !!state.activeBatchDocId;

  els.btnStart.disabled = hasBatch;
  els.btnHold.disabled = !hasBatch || state.currentStatus !== "running";
  els.btnResume.disabled = !hasBatch || state.currentStatus !== "on_hold";
  els.btnComplete.disabled = !hasBatch || (state.currentStatus !== "running" && state.currentStatus !== "on_hold");
}