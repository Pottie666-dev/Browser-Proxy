// Pure checks also used by the release preflight. Never include values in errors.
export function assertDeploymentPolicy(env) {
  const reject = () => {
    throw new Error("Unsafe or incomplete production configuration");
  };
  if (
    env.NODE_ENV !== "production" ||
    env.HOST !== "127.0.0.1" ||
    env.BROWSER_ENGINE_ENABLED !== "true"
  )
    reject();
  for (const key of [
    "ALLOW_IN_MEMORY_DB",
    "BROWSER_ALLOW_DIRECT",
    "BROWSER_NO_SANDBOX",
    "BROWSER_DISABLE_SANDBOX",
    "BROWSER_TEST_CONFINED",
  ])
    if (env[key] && env[key] !== "false") reject();
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0" || env.BROWSER_NAMESPACE_WRAPPER)
    reject();
  if (
    env.NODE_OPTIONS &&
    /--(?:require|import|experimental-loader|loader|inspect)/.test(
      env.NODE_OPTIONS,
    )
  )
    reject();
  if (env.CHROMIUM_FLAGS || env.CHROME_FLAGS || env.BROWSER_EXTRA_ARGS)
    reject();
  const origin = new URL(env.PUBLIC_API_ORIGIN);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    !origin.hostname.includes(".")
  )
    reject();
  const cors = (env.CORS_ORIGINS || "").split(",");
  if (!cors.includes(origin.origin)) reject();
  for (const value of cors) {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.origin !== value ||
      u.username ||
      u.password
    )
      reject();
  }
  const key = env.ACCOUNT_ENCRYPTION_KEY || "";
  if (
    (/^[a-f0-9]{64}$/i.test(key)
      ? Buffer.from(key, "hex")
      : Buffer.from(key, "base64")
    ).length !== 32
  )
    reject();
  if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI || "")) reject();
  const query = new URLSearchParams((env.MONGODB_URI || "").split("?")[1]);
  if (
    query.get("tls") !== "true" &&
    query.get("ssl") !== "true" &&
    !env.MONGODB_URI.startsWith("mongodb+srv://")
  )
    reject();
  for (const [k, v] of query)
    if (
      (/^(tls|ssl)$/i.test(k) && v !== "true") ||
      (/^(tlsInsecure|tlsAllowInvalidCertificates|tlsAllowInvalidHostnames)$/i.test(
        k,
      ) &&
        v !== "false")
    )
      reject();
  if (!(env.WEBRTC_TURN_SECRET?.length >= 32)) reject();
  const turns = (env.WEBRTC_TURN_URLS || "").split(",");
  if (
    !turns.length ||
    turns.some(
      (u) => !/^turns?:[a-zA-Z0-9.:[\]-]+(?:\?transport=(?:udp|tcp))?$/.test(u),
    )
  )
    reject();
  if (
    !turns.some((u) => u.startsWith("turns:") && u.endsWith("?transport=tcp"))
  )
    reject();
  if (
    !(env.CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium").startsWith("/usr/")
  )
    reject();
}
