import { state } from "./state.js";
import { db, doc, setDoc, updateDoc, serverTimestamp, arrayUnion } from "./firebase.js";
import { groupItemsByChiller } from "./qr.js";

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTodayCompact() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function sanitizeForId(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_\-]/g, "");
}

function buildRunId(chillerSerialNumber, epochMs) {
  return `${sanitizeForId(chillerSerialNumber)}_${getTodayCompact()}_FABRICATION_BATCH_${epochMs}`;
}

function buildBatchSessionId(epochMs) {
  return `FAB_${getTodayCompact()}_${epochMs}`;
}

function buildLaneSummary(items) {
  const summary = {
    EVAPORATOR: 0,
    CONDENSER: 0,
    OIL_SEPARATOR: 0,
    ECONOMIZER: 0,
    FABRICATION: 0
  };

  for (const item of items) {
    const lane = item.laneType || "FABRICATION";
    if (summary[lane] == null) summary[lane] = 0;
    summary[lane] += 1;
  }

  return summary;
}

export async function startBatchRun(processName) {
  if (!state.employeeData) throw new Error("Employee data missing.");
  if (!state.scannedItems.length) throw new Error("No scanned items.");
  if (!processName) throw new Error("Please select a process.");

  const nowMs = Date.now();
  const batchSessionId = buildBatchSessionId(nowMs);
  const grouped = groupItemsByChiller(state.scannedItems);
  const activeRunDocs = [];

  for (const group of grouped) {
    const chillerSerialNumber = String(group.chillerSerialNumber || "").trim();
    const runId = buildRunId(chillerSerialNumber, nowMs);

    const payload = {
      runType: "fabrication_batch",
      batchSessionId,

      serialNumber: chillerSerialNumber,
      chillerSerialNumber,
      projectName: group.projectName,

      station: "Fabrication",
      processName,
      status: "running",

      startedByName: state.employeeData.employeeName,
      startedByNumber: state.employeeData.employeeNumber,
      employeeStation: state.employeeData.station,
      manpower: 1,

      startAt: serverTimestamp(),
      startEpochMs: nowMs,
      resumedAt: null,
      resumedEpochMs: null,
      endAt: null,
      endEpochMs: null,

      holds: [],
      resumes: [],

      runDate: getTodayKey(),
      itemCount: group.items.length,
      items: group.items.map(item => ({
        itemID: item.itemID,
        description: item.description,
        laneType: item.laneType,
        projectName: item.projectName
      })),
      laneSummary: buildLaneSummary(group.items)
    };

    const runRef = doc(db, "processRuns", chillerSerialNumber, "runs", runId);
    await setDoc(runRef, payload);

    activeRunDocs.push({
      chillerSerialNumber,
      runId
    });
  }

  state.activeBatchSessionId = batchSessionId;
  state.activeRunDocs = activeRunDocs;
  state.currentStatus = "running";
  state.runAccumMs = 0;
  state.runRunning = true;
  state.runStartEpoch = nowMs;

  return {
    batchSessionId,
    activeRunDocs
  };
}

export async function holdBatchRun(holdReason = "others", remarks = "") {
  if (!state.activeRunDocs.length) throw new Error("No active batch runs.");

  const holdAtEpochMs = Date.now();
  const holdObj = {
    holdAt: new Date().toISOString(),
    holdAtEpochMs,
    holdReason,
    remarks,
    byName: state.employeeData?.employeeName || "-",
    byNumber: state.employeeData?.employeeNumber || "-"
  };

  for (const refInfo of state.activeRunDocs) {
    const runRef = doc(db, "processRuns", refInfo.chillerSerialNumber, "runs", refInfo.runId);
    await updateDoc(runRef, {
      status: "on_hold",
      holds: arrayUnion(holdObj)
    });
  }

  if (state.runRunning && state.runStartEpoch) {
    state.runAccumMs += Date.now() - state.runStartEpoch;
  }

  state.runRunning = false;
  state.runStartEpoch = null;
  state.currentStatus = "on_hold";
}

export async function resumeBatchRun() {
  if (!state.activeRunDocs.length) throw new Error("No active batch runs.");

  const resumedAtEpochMs = Date.now();
  const resumeObj = {
    resumedAt: new Date().toISOString(),
    resumedAtEpochMs,
    byName: state.employeeData?.employeeName || "-",
    byNumber: state.employeeData?.employeeNumber || "-"
  };

  for (const refInfo of state.activeRunDocs) {
    const runRef = doc(db, "processRuns", refInfo.chillerSerialNumber, "runs", refInfo.runId);
    await updateDoc(runRef, {
      status: "running",
      resumedAt: serverTimestamp(),
      resumedEpochMs: resumedAtEpochMs,
      resumes: arrayUnion(resumeObj)
    });
  }

  state.runRunning = true;
  state.runStartEpoch = resumedAtEpochMs;
  state.currentStatus = "running";
}

export async function completeBatchRun() {
  if (!state.activeRunDocs.length) throw new Error("No active batch runs.");

  const endEpochMs = Date.now();

  if (state.runRunning && state.runStartEpoch) {
    state.runAccumMs += endEpochMs - state.runStartEpoch;
  }

  for (const refInfo of state.activeRunDocs) {
    const runRef = doc(db, "processRuns", refInfo.chillerSerialNumber, "runs", refInfo.runId);
    await updateDoc(runRef, {
      status: "completed",
      endAt: serverTimestamp(),
      endEpochMs,
      actualDurationMs: state.runAccumMs
    });
  }

  state.runRunning = false;
  state.runStartEpoch = null;
  state.currentStatus = "completed";
}