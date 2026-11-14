// Vehicle profiles are data, not code: one JSON file per vehicle in this folder.
// Backend code takes a vehicle object and must never assume a particular car.
// (These could move to a database table later without changing callers.)
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_VEHICLE_ID = 'atto3-2025-extended';

const vehicles = new Map(
  fs.readdirSync(import.meta.dirname)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, f), 'utf8')))
    .map((v) => [v.id, v]),
);

// Returns the vehicle, or undefined for an unknown id.
export function getVehicle(id = DEFAULT_VEHICLE_ID) {
  return vehicles.get(id);
}

export function listVehicles() {
  return [...vehicles.values()];
}
