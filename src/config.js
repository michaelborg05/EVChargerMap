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
  keys: {
    google: process.env.GOOGLE_API_KEY,
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
