// Keeps the demo in step with the real Nestly website.
//
//   node scripts/sync.mjs --pull   copy the website's latest code in, then apply the demo layer
//   node scripts/sync.mjs          only (re)apply the demo layer
//
// The demo layer is:
//   1. src/demo/**            the fake backend, payment sheet, tours (demo-only files, never overwritten)
//   2. demo-overlay/**        whole files that replace the website's (lib/paystack.ts, lib/socket.ts, ...)
//   3. INJECTIONS below       small edits to website files that otherwise stay as they are
//
// Every injection checks its anchor and stops loudly if the website changed
// around it, so a sync never silently drops part of the demo.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const website = process.env.NESTLY_WEBSITE ?? path.resolve(root, "../social-media-market/social-marketplace-app");
const pull = process.argv.includes("--pull");

const KEEP = new Set(["src/demo", "demo-overlay", "scripts", "public/demo", ".git", "node_modules", ".next", ".env", ".env.local", "README.md", "DEMO.md", "package.json", "package-lock.json"]);

const copyDir = (from, to, rel = "") => {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const relPath = path.posix.join(rel, entry.name);
    if (KEEP.has(relPath) || /^\.env/.test(entry.name) || ["AGENTS.md", "CLAUDE.md", "DEPLOYMENT.md", ".git", "node_modules", ".next"].includes(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      copyDir(src, dst, relPath);
    } else fs.copyFileSync(src, dst);
  }
};

if (pull) {
  if (!fs.existsSync(path.join(website, "package.json"))) throw new Error(`Website not found at ${website} (set NESTLY_WEBSITE)`);
  console.log("Pulling website code from", website);
  copyDir(website, root);
  // Website dependencies, but keep the demo's own name.
  const web = JSON.parse(fs.readFileSync(path.join(website, "package.json"), "utf8"));
  const mine = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ ...web, name: mine.name, scripts: { ...web.scripts, ...mine.scripts } }, null, 2) + "\n");
}

// 2. Overlay files.
const overlay = path.join(root, "demo-overlay");
const applyOverlay = (dir, rel = "") => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = path.join(rel, entry.name);
    if (entry.isDirectory()) applyOverlay(path.join(dir, entry.name), relPath);
    else {
      fs.mkdirSync(path.dirname(path.join(root, relPath)), { recursive: true });
      fs.copyFileSync(path.join(dir, entry.name), path.join(root, relPath));
      console.log("overlay   ", relPath.replace(/\\/g, "/"));
    }
  }
};
applyOverlay(overlay);

// 3. Injections: [file, anchor, replacement]. Skipped when already applied.
const INJECTIONS = [
  [
    "src/lib/axios.ts",
    `import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";`,
    `import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";\nimport { demoAdapter } from "../demo/adapter"; // DEMO\n\n// DEMO: every request is answered in the browser by the demo backend.\naxios.defaults.adapter = demoAdapter;`,
  ],
  ["src/lib/axios.ts", `  withCredentials: true,\n});`, `  withCredentials: true,\n  adapter: demoAdapter, // DEMO\n});`],
  ["src/app/layout.tsx", `import Navbar from "../components/ui/navbar";`, `import Navbar from "../components/ui/navbar";\nimport DemoChrome from "../demo/ui/demo-chrome"; // DEMO`],
  ["src/app/layout.tsx", `        <Providers>\n`, `        <Providers>\n          <DemoChrome />\n`],
  // The start screen has its own header.
  ["src/components/ui/navbar.tsx", `  const showLogin = pathname === "/signup";\n`, `  const showLogin = pathname === "/signup";\n  if (pathname === "/") return null; // DEMO: the start screen has its own header\n`],
];

for (const [file, anchor, replacement] of INJECTIONS) {
  const full = path.join(root, file);
  let text = fs.readFileSync(full, "utf8");
  const crlf = text.includes("\r\n");
  text = text.replace(/\r\n/g, "\n");
  if (text.includes(replacement)) {
    console.log("injected  ", file, "(already)");
    continue;
  }
  if (!text.includes(anchor)) throw new Error(`Injection anchor not found in ${file}:\n${anchor}\nThe website changed here - update scripts/sync.mjs.`);
  text = text.replace(anchor, replacement);
  fs.writeFileSync(full, crlf ? text.replace(/\n/g, "\r\n") : text);
  console.log("injected  ", file);
}

console.log("\nDemo layer applied.");
