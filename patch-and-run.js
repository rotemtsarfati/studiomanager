import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const sourcePath = path.join(process.cwd(), "server.js");
let source = fs.readFileSync(sourcePath, "utf8");

const helpers = String.raw`

function collectMembershipCandidates(value, out = [], depth = 0) {
  if (depth > 8 || value == null) return out;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object" && !Array.isArray(item)) out.push(item);
      collectMembershipCandidates(item, out, depth + 1);
    }
    return out;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value)) collectMembershipCandidates(child, out, depth + 1);
  }
  return out;
}

function flattenPackageFields(value, prefix = "", out = [], depth = 0) {
  if (depth > 6 || value == null) return out;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push({ key: prefix.toLowerCase(), value: String(value) });
    return out;
  }
  if (Array.isArray(value)) {
    value.slice(0, 30).forEach((item, index) => flattenPackageFields(item, prefix + "[" + index + "]", out, depth + 1));
    return out;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) flattenPackageFields(child, prefix ? prefix + "." + key : key, out, depth + 1);
  }
  return out;
}

function extractUrlsFromPackage(item) {
  const fields = flattenPackageFields(item);
  const urls = [];
  for (const field of fields) {
    const matches = field.value.match(/https?:\\/\\/[^\\s"'<>]+/gi) || [];
    for (const rawUrl of matches) {
      const clean = rawUrl.replace(/[),.;]+$/, "");
      if (urls.some((entry) => entry.url === clean)) continue;
      const keyBonus = /(purchase|payment|checkout|shop|sale|link|url)/i.test(field.key) ? 20 : 0;
      const arboxBonus = /arbox\\.link\\//i.test(clean) ? 60 : /arboxapp\\.com/i.test(clean) ? 15 : 0;
      urls.push({ url: clean, score: keyBonus + arboxBonus, key: field.key });
    }
  }
  return urls.sort((a, b) => b.score - a.score);
}

function parsePackageRequest(text) {
  const value = String(text || "").toLowerCase();
  const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, sixteen: 16, twenty: 20 };
  let sessions = null;
  const numeric = value.match(/\\b(\\d{1,3})\\s*(?:classes|lessons|sessions|entries|visits)\\b/i);
  if (numeric) sessions = Number(numeric[1]);
  if (!sessions) {
    for (const [word, count] of Object.entries(numberWords)) {
      if (new RegExp("\\\\b" + word + "\\\\s+(?:classes|lessons|sessions|entries|visits)\\\\b", "i").test(value)) {
        sessions = count;
        break;
      }
    }
  }

  let type = null;
  if (/\\breformer\\b|pilates reformer/i.test(value)) type = "reformer";
  else if (/\\bmat\\b|mat pilates|strength|functional|floor/i.test(value)) type = "mat";
  return { sessions, type };
}

function scorePackageCandidate(item, request) {
  const fields = flattenPackageFields(item);
  const searchable = fields.map((field) => field.key + ":" + field.value).join(" ").toLowerCase();
  let score = 0;
  let exactCount = request.sessions == null;
  let typeMatch = request.type == null;

  if (request.sessions != null) {
    const countField = fields.some((field) =>
      /(entries|entry|sessions|session|visits|visit|classes|class|quantity|count|uses|credits)/i.test(field.key) &&
      Number(field.value) === request.sessions
    );
    const nameCount = new RegExp("(^|[^0-9])" + request.sessions + "([^0-9]|$)").test(searchable);
    exactCount = countField || nameCount;
    if (countField) score += 100;
    else if (nameCount) score += 55;
    else score -= 80;
  }

  if (request.type === "reformer") {
    typeMatch = /reformer/i.test(searchable);
    if (typeMatch) score += 80;
    if (/\\bmat\\b|strength|functional/i.test(searchable) && !/reformer/i.test(searchable)) score -= 60;
  } else if (request.type === "mat") {
    typeMatch = /\\bmat\\b|mat pilates|strength|functional|floor/i.test(searchable) && !/reformer/i.test(searchable);
    if (typeMatch) score += 80;
    if (/reformer/i.test(searchable)) score -= 70;
  }

  const urls = extractUrlsFromPackage(item);
  if (urls.length) score += Math.min(35, urls[0].score);
  const nameField = fields.find((field) => /(^|\\.)(name|title|membership_type_name)$/.test(field.key));
  const priceField = fields.find((field) => /(^|\\.)(price|cost|amount)$/.test(field.key) && /^\\d+(?:\\.\\d+)?$/.test(field.value));

  return {
    score,
    exactCount,
    typeMatch,
    name: nameField?.value || null,
    price: priceField?.value || null,
    direct_url: urls[0]?.url || null,
    url_source: urls[0]?.key || null,
    item
  };
}

function resolveArboxPackageRequest(memberships, customerText) {
  const request = parsePackageRequest(customerText);
  if (!memberships?.ok || (!request.sessions && !request.type)) {
    return { request, match: null, candidates: [], shop_url: BE_STUDIOS_MEMBERSHIP_SHOP };
  }

  const rawCandidates = collectMembershipCandidates(memberships.membership_types).filter((item) => {
    const fields = flattenPackageFields(item);
    const keys = fields.map((field) => field.key).join(" ");
    const text = fields.map((field) => field.value).join(" ");
    return /(membership|package|name|title|price|entries|sessions|visits)/i.test(keys) && text.length > 0;
  });

  const unique = [];
  const seen = new Set();
  for (const item of rawCandidates) {
    let signature;
    try { signature = JSON.stringify(item); } catch { signature = String(item); }
    if (!seen.has(signature)) {
      seen.add(signature);
      unique.push(item);
    }
  }

  const scored = unique.map((item) => scorePackageCandidate(item, request)).sort((a, b) => b.score - a.score);
  const eligible = scored.filter((candidate) => candidate.exactCount && candidate.typeMatch);
  const best = eligible[0] || null;
  const second = eligible[1] || null;
  const confident = Boolean(best && (!second || best.score - second.score >= 10 || (best.direct_url && !second.direct_url)));
  const match = confident ? best : null;
  const candidates = scored.slice(0, 8).map(({ item, ...candidate }) => candidate);

  console.log(match ? "ARBOX_PACKAGE_MATCH" : "ARBOX_PACKAGE_MATCH_AMBIGUOUS", JSON.stringify({
    request,
    match: match ? { name: match.name, price: match.price, direct_url: match.direct_url, score: match.score } : null,
    candidates: candidates.slice(0, 4)
  }));

  return {
    request,
    match: match ? { name: match.name, price: match.price, direct_url: match.direct_url, url_source: match.url_source, score: match.score } : null,
    candidates,
    shop_url: BE_STUDIOS_MEMBERSHIP_SHOP
  };
}
`;

if (!source.includes("function resolveArboxPackageRequest(")) {
  const marker = "\nconst SCHEDULE_TOOL = {";
  if (!source.includes(marker)) throw new Error("Could not find package-helper insertion point.");
  source = source.replace(marker, helpers + marker);
}

const oldBlock = `  let livePackageContext = "";
  if (hasPackageIntent(packageIntentSource)) {
    const memberships = await getArboxMembershipTypes();
    livePackageContext = \`LIVE ARBOX PACKAGE DATA (already fetched for this reply):\\n\${JSON.stringify(memberships)}\\n\\nIMPORTANT: Use this live data now to identify the exact package that matches the customer's requested number/type of classes. If an exact direct purchase/payment/shop URL exists in this data, include it in the CURRENT customer reply. If live data has no direct package URL or fails, use the official Arbox membership shop \${BE_STUDIOS_MEMBERSHIP_SHOP} as the purchase path instead of telling the customer the page is unavailable.\\n\\n\`;
  }`;

const newBlock = `  let livePackageContext = "";
  if (hasPackageIntent(packageIntentSource)) {
    const memberships = await getArboxMembershipTypes();
    const packageResolution = resolveArboxPackageRequest(memberships, packageIntentSource);
    livePackageContext = \`LIVE ARBOX PACKAGE RESOLUTION (already fetched and matched for this reply):\\n\${JSON.stringify(packageResolution)}\\n\\nRAW LIVE ARBOX PACKAGE DATA (use only if needed to disambiguate):\\n\${JSON.stringify(memberships)}\\n\\nIMPORTANT: The server has already matched the requested session count and class type. If packageResolution.match exists, use THAT package only. If match.direct_url exists, include that exact URL in the CURRENT reply. Never promise to send a link later. If a match exists without a direct_url, use the official Arbox shop \${BE_STUDIOS_MEMBERSHIP_SHOP} and name the exact matched package. If no confident match exists because the class type is missing or more than one package fits, ask one short clarifying question instead of guessing.\\n\\n\`;
  }`;

if (!source.includes(oldBlock)) throw new Error("Could not find live package context block.");
source = source.replace(oldBlock, newBlock);

const oldRule = "- When live Arbox package data is already included in the request context, use it directly. Do not call the tool again unless needed, and do not ignore it.";
const newRule = "- When LIVE ARBOX PACKAGE RESOLUTION is included in the request context, packageResolution.match is the server-selected package. Do not choose a different package unless match is null. If direct_url exists, include it exactly.\n" + oldRule;
source = source.replace(oldRule, newRule);

// The generated module runs from /tmp, so make static-file resolution point back to the project root.
source = source.replace(
  'const __dirname = path.dirname(fileURLToPath(import.meta.url));',
  'const __dirname = process.cwd();'
);

const generatedPath = path.join(os.tmpdir(), `be-studios-server-${process.pid}.mjs`);
fs.writeFileSync(generatedPath, source, "utf8");
await import(pathToFileURL(generatedPath).href);
