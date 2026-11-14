// All configuration comes from environment variables (see .env.example).
// Required values fail fast at startup; API keys are optional until the
// feature that needs them is built, so they're read lazily via requireKey().

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 3000),
  // Advanced markers need a map ID. Google's DEMO_MAP_ID works for
  // development; create a real one (free) in Google Cloud before hosting.
  googleMapsMapId: process.env.GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID',
  keys: {
    // Server-side only: never send this one to the browser.
    googlePlaces: process.env.GOOGLE_PLACES_API_KEY,
    // Browser key for the map page. Public by design; protected by API,
    // referrer and quota restrictions in Google Cloud.
    googleMaps: process.env.GOOGLE_MAPS_API_KEY,
    openRouteService: process.env.OPENROUTESERVICE_API_KEY,
    openChargeMap: process.env.OPENCHARGE_API_KEY,
  },
};

// Call when a feature actually needs a key, e.g. requireKey('openChargeMap').
// The error names the variable, never its value.
export function requireKey(name) {
  const value = config.keys[name];
  if (!value) throw new Error(`API key "${name}" is not set; check .env`);
  return value;
}
