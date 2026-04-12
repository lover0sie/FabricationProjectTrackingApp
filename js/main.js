import { state } from "./state.js";
import { parseEmployeeQR, parseFabricationItemQR } from "./qr.js";
import {
  showStep,
  renderEmployee,
  renderItems,
  renderGroupedItems,
  renderTimer,
  setStatusText,
  setRunMeta,
  updateActionButtons
} from "./ui.js";
import {
  startBatchRun,
  holdBatchRun,
  resumeBatchRun,
  completeBatchRun
} from "./fabricationRuns.js";

const employeeInput = document.getElementById("employeeInput");
const itemInput = document.getElementById("itemInput");
const processSelect = document.getElementById("processSelect");

const btnEmployeeSubmit = document.getElementById("btnEmployeeSubmit");
const btnEmployeeClear = document.getElementById("btnEmployeeClear");
const btnAddItem = document.getElementById("btnAddItem");
const btnClearItems = document.getElementById("btnClearItems");
const btnGoReview = document.getElementById("btnGoReview");
const btnStart = document.getElementById("btnStart");
const btnHold = document.getElementById("btnHold");
const btnResume = document.getElementById("btnResume");
const btnComplete = document.getElementById("btnComplete");

function resetTimerUiLoop() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    renderTimer();
  }, 1000);
}

function isDuplicateItem(newItem) {
  return state.scannedItems.some(item =>
    String(item.itemID).trim().toUpperCase() === String(newItem.itemID).trim().toUpperCase()
  );
}

btnEmployeeSubmit.addEventListener("click", () => {
  try {
    const employee = parseEmployeeQR(employeeInput.value);
    state.employeeData = employee;
    renderEmployee();
    showStep(2);
    setStatusText(`Employee confirmed: ${employee.employeeName}`);
  } catch (err) {
    alert(err.message);
  }
});

btnEmployeeClear.addEventListener("click", () => {
  employeeInput.value = "";
  state.employeeData = null;
  renderEmployee();
  setStatusText("Employee cleared.");
});

btnAddItem.addEventListener("click", () => {
  try {
    if (state.scannedItems.length >= 20) {
      alert("Maximum 20 items per batch.");
      return;
    }

    const item = parseFabricationItemQR(itemInput.value);

    if (isDuplicateItem(item)) {
      alert(`Duplicate item detected: ${item.itemID}`);
      return;
    }

    state.scannedItems.push(item);
    renderItems();
    itemInput.value = "";
    setStatusText(`Added item ${item.itemID}`);
  } catch (err) {
    alert(err.message);
  }
});

btnClearItems.addEventListener("click", () => {
  state.scannedItems = [];
  renderItems();
  setStatusText("All scanned items cleared.");
});

btnGoReview.addEventListener("click", () => {
  if (!state.scannedItems.length) {
    alert("Please scan at least 1 item.");
    return;
  }
  renderGroupedItems();
  showStep(3);
  setStatusText("Review your grouped items.");
});

btnStart.addEventListener("click", async () => {
  try {
    const processName = processSelect.value;
    const docId = await startBatchRun(processName);
    resetTimerUiLoop();
    renderTimer();
    setRunMeta(`Active batch doc: ${docId}`);
    updateActionButtons();
    setStatusText("Batch run started.");
  } catch (err) {
    alert(err.message);
  }
});

btnHold.addEventListener("click", async () => {
  try {
    const holdReason = prompt("Enter hold reason", "others") || "others";
    const remarks = prompt("Enter remarks", "") || "";
    await holdBatchRun(holdReason, remarks);
    renderTimer();
    updateActionButtons();
    setStatusText("Batch run is on hold.");
  } catch (err) {
    alert(err.message);
  }
});

btnResume.addEventListener("click", async () => {
  try {
    await resumeBatchRun();
    renderTimer();
    updateActionButtons();
    setStatusText("Batch run resumed.");
  } catch (err) {
    alert(err.message);
  }
});

btnComplete.addEventListener("click", async () => {
  try {
    await completeBatchRun();
    renderTimer();
    updateActionButtons();
    setStatusText("Batch run completed.");
  } catch (err) {
    alert(err.message);
  }
});

showStep(1);
renderEmployee();
renderItems();
renderTimer();
updateActionButtons();
resetTimerUiLoop();