import { state } from "./state.js";
import { db, collection, addDoc, updateDoc, doc, serverTimestamp, arrayUnion } from "./firebase.js";

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildProjectGroups(items) {
  const map = new Map();

  for (const item of items) {
    const key = item.chillerSerialNumber;
    if (!map.has(key)) {
      map.set(key, {
        chillerSerialNumber: item.chillerSerialNumber,
        projectName: item.projectName,
        items: []
      });
    }
    map.get(key).items.push({
      itemID: item.itemID,
      description: item.description,
      laneType: item.laneType
    });
  }

  return Array.from(map.values());
}

export async function startBatchRun(processName) {
  if (!state.employeeData) throw new Error("Employee data missing.");
  if (!state.scannedItems.length) throw new Error("No scanned items.");
  if (!processName) throw new Error("Please select a process.");

  const nowMs = Date.now();
  const payload = {
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
    createdAt: serverTimestamp(),

    itemsFlat: state.scannedItems.map(item => ({ ...item })),
    projectGroups: buildProjectGroups(state.scannedItems)
  };

  const ref = await addDoc(collection(db, "fabricationRuns"), payload);
  state.activeBatchDocId = ref.id;
  state.currentStatus = "running";
  state.runAccumMs = 0;
  state.runRunning = true;
  state.runStartEpoch = nowMs;

  return ref.id;
}

export async function holdBatchRun(holdReason = "others", remarks = "") {
  if (!state.activeBatchDocId) throw new Error("No active batch run.");

  const holdAtEpochMs = Date.now();

  await updateDoc(doc(db, "fabricationRuns", state.activeBatchDocId), {
    status: "on_hold",
    holds: arrayUnion({
      holdAt: new Date().toISOString(),
      holdAtEpochMs,
      holdReason,
      remarks,
      byName: state.employeeData?.employeeName || "-",
      byNumber: state.employeeData?.employeeNumber || "-"
    })
  });

  if (state.runRunning && state.runStartEpoch) {
    state.runAccumMs += Date.now() - state.runStartEpoch;
  }

  state.runRunning = false;
  state.runStartEpoch = null;
  state.currentStatus = "on_hold";
}

export async function resumeBatchRun() {
  if (!state.activeBatchDocId) throw new Error("No active batch run.");

  const resumedAtEpochMs = Date.now();

  await updateDoc(doc(db, "fabricationRuns", state.activeBatchDocId), {
    status: "running",
    resumedAt: serverTimestamp(),
    resumedEpochMs: resumedAtEpochMs,
    resumes: arrayUnion({
      resumedAt: new Date().toISOString(),
      resumedAtEpochMs,
      byName: state.employeeData?.employeeName || "-",
      byNumber: state.employeeData?.employeeNumber || "-"
    })
  });

  state.runRunning = true;
  state.runStartEpoch = resumedAtEpochMs;
  state.currentStatus = "running";
}

export async function completeBatchRun() {
  if (!state.activeBatchDocId) throw new Error("No active batch run.");

  const endEpochMs = Date.now();

  if (state.runRunning && state.runStartEpoch) {
    state.runAccumMs += endEpochMs - state.runStartEpoch;
  }

  await updateDoc(doc(db, "fabricationRuns", state.activeBatchDocId), {
    status: "completed",
    endAt: serverTimestamp(),
    endEpochMs,
    actualDurationMs: state.runAccumMs
  });

  state.runRunning = false;
  state.runStartEpoch = null;
  state.currentStatus = "completed";
}