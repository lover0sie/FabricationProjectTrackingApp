export const state = {
  employeeData: null,
  scannedItems: [],
  groupedItems: [],
  activeBatchId: null,
  activeBatchDocId: null,

  timerInterval: null,
  runRunning: false,
  runAccumMs: 0,
  runStartEpoch: null,

  currentStatus: "idle"
};