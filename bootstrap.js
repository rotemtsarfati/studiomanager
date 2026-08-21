import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const wrapperPath = path.join(process.cwd(), "patch-and-run.js");
let wrapper = fs.readFileSync(wrapperPath, "utf8");

const marker = "const generatedPath = path.join(os.tmpdir(), `be-studios-server-${process.pid}.mjs`);";
if (!wrapper.includes(marker)) throw new Error("Could not find patch-and-run bootstrap marker.");

const dashboardModuleUrl = pathToFileURL(path.join(process.cwd(), "chatwoot-dashboard.js")).href;
const injection = `const dashboardModuleUrl = ${JSON.stringify(dashboardModuleUrl)};\nsource = source.replace(\n  'app.get(\"/health\", (_req, res) => res.json({ ok: true }));',\n  \`const { installChatwootDashboard } = await import(\${JSON.stringify(dashboardModuleUrl)});\\ninstallChatwootDashboard({ app, getChatwootConversationMessages, chatwootHeaders, CHATWOOT_BASE_URL });\\n\\napp.get(\"/health\", (_req, res) => res.json({ ok: true }));\`\n);\n\n${marker}`;

wrapper = wrapper.replace(marker, injection);
const tempWrapper = path.join(os.tmpdir(), `be-studios-wrapper-${process.pid}.mjs`);
fs.writeFileSync(tempWrapper, wrapper, "utf8");
await import(pathToFileURL(tempWrapper).href);
