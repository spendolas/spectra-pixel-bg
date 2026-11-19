// Is the page served from a DEV host — localhost, the LAN, or a Tailscale peer?
//
// Single source of truth for gating ALL dev-only tooling (timeline panel /edit/,
// Yard glitch lab /lab/, wash panel, shader ?ghost, and every ?-param override).
// Production is the public domain www.spendolas.com, which never matches any rule
// here, so dev tooling can NEVER activate in production — while local, LAN, and
// tailnet access (including `tailscale serve` over *.ts.net and raw 100.64/10
// Tailscale IPs) all enable it, so the whole dev surface is reachable off-machine.
//
// Match rules (all private/non-routable — never a public production host):
//   localhost / 127.0.0.1 / ::1 / 0.0.0.0, *.localhost, *.local (mDNS),
//   *.ts.net (Tailscale MagicDNS), and private IPv4:
//   10/8, 192.168/16, 172.16–31/12, 100.64/10 (Tailscale CGNAT).

export function isDevHost(host) {
  const h = host != null ? host : typeof location !== "undefined" ? location.hostname : "";
  if (!h) return false;
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || h === "0.0.0.0") return true;
  // Bare single-label host (no dots/colons): a Tailscale MagicDNS short name or a
  // LAN/NetBIOS name. Production is always a dotted public FQDN, so this is safe.
  if (!h.includes(".") && !h.includes(":")) return true;
  if (/(^|\.)localhost$/i.test(h)) return true; // *.localhost
  if (/\.local$/i.test(h)) return true; // mDNS / Bonjour
  if (/\.ts\.net$/i.test(h)) return true; // Tailscale MagicDNS (incl. `tailscale serve`)
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 10 || a === 127) return true; // 10/8, loopback
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16–31/12
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 (Tailscale CGNAT)
  }
  return false;
}

// Evaluated once at load against the current host.
export const IS_DEV_HOST = isDevHost();

const FLAG_KEY = "spendolas.dev";

function isLoopback(h) {
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || /(^|\.)localhost$/i.test(h);
}

// Opt-in dev gate: loopback always; other dev hosts (LAN / tailnet) only when
// localStorage["spendolas.dev"] === "1". ?dev=on / ?dev=off on a dev host sets /
// clears the flag and the param is stripped from the URL.
export function isDevEnabled() {
  if (typeof location === "undefined") return false;
  const h = location.hostname;
  if (isLoopback(h)) return true;
  if (!isDevHost(h)) return false;
  try {
    const q = new URLSearchParams(location.search);
    const v = q.get("dev");
    if (v === "on" || v === "off") {
      if (v === "on") localStorage.setItem(FLAG_KEY, "1");
      else localStorage.removeItem(FLAG_KEY);
      q.delete("dev");
      const qs = q.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    }
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch (e) {
    return false;
  }
}
