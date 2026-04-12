function cleanText(v) {
  return String(v || "").trim();
}

export function parseEmployeeQR(text) {
  const raw = cleanText(text);
  const parts = raw.split(";").map(s => s.trim());

  if (parts.length < 4 || parts[0] !== "EMP") {
    throw new Error("Invalid employee QR format. Expected EMP;EmpNo;Name;Station");
  }

  return {
    employeeNumber: parts[1],
    employeeName: parts[2],
    station: parts[3]
  };
}

export function getLaneType(description) {
  const d = cleanText(description).toLowerCase();

  if (d === "evaporator") return "EVAPORATOR";
  if (d === "condenser") return "CONDENSER";
  if (d === "oil separator") return "OIL_SEPARATOR";
  if (d === "economizer") return "ECONOMIZER";

  return "FABRICATION";
}

export function parseFabricationItemQR(text) {
  const raw = cleanText(text);
  const parts = raw.split(";").map(s => s.trim());

  if (parts.length !== 4) {
    throw new Error("Invalid item QR format. Expected chillerSerialNumber;project;description;itemID");
  }

  const [chillerSerialNumber, projectName, description, itemID] = parts;

  if (!chillerSerialNumber || !projectName || !description || !itemID) {
    throw new Error("Item QR contains empty values.");
  }

  return {
    chillerSerialNumber,
    projectName,
    description,
    itemID,
    laneType: getLaneType(description)
  };
}

export function groupItemsByChiller(items) {
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
    map.get(key).items.push(item);
  }

  return Array.from(map.values());
}