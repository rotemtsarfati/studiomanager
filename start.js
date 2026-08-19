import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const patchRunnerPath = path.join(process.cwd(), "patch-and-run.js");
let patchRunnerSource = fs.readFileSync(patchRunnerPath, "utf8");

const insertionMarker = "// The generated module runs from /tmp, so make static-file resolution point back to the project root.";

const medicalPolicyPatch = String.raw`
// Be Studios medical cancellation / package-extension policy.
// This is intentionally injected into the core AI instructions so a genuine
// medical issue is treated as an approved extension, not as something staff
// still needs to check or approve.
if (!source.includes("MEDICAL CANCELLATIONS AND PACKAGE EXTENSIONS")) {
  const medicalMarker = "\\nSTAFF GUIDANCE\\n";
  const medicalRules = \`\\nMEDICAL CANCELLATIONS AND PACKAGE EXTENSIONS\\n- When a customer explains that a genuine medical issue, injury, illness, pain, recovery period, or doctor's instruction prevents them from attending booked classes or using their package within its validity period, treat this as an automatically approved reason for cancellation and package extension.\\n- If they ask to cancel upcoming classes because of that medical issue, confirm that Be Studios will cancel those classes.\\n- If they ask to extend their package because of that medical issue, ALWAYS confirm that Be Studios will extend it. Do not present the extension as pending approval or as something that needs to be checked.\\n- NEVER say phrases such as: “I’ll check if the package can be extended”, “let me see if we can extend it”, “I’ll ask if an extension is possible”, “we’ll check whether we can make an exception”, or similar wording.\\n- If the customer gives a specific requested extension date, confirm that date unless the conversation contains a clear conflicting studio instruction.\\n- Do not ask for medical documentation unless staff explicitly instructs you to do so.\\n- Keep the reply warm and concise: acknowledge the situation, reassure the customer, confirm the requested cancellations and extension, and wish them a smooth recovery.\\n- Example tone: “I’m very sorry to hear that. We’ll cancel your upcoming classes and extend your package until mid-October. Wishing you a smooth recovery ❤️”\\n\\nSTAFF GUIDANCE\\n\`;
  if (!source.includes(medicalMarker)) throw new Error("Could not find STAFF GUIDANCE insertion point for medical policy.");
  source = source.replace(medicalMarker, medicalRules);
}

`;

if (!patchRunnerSource.includes(insertionMarker)) {
  throw new Error("Could not find insertion point in patch-and-run.js");
}

patchRunnerSource = patchRunnerSource.replace(insertionMarker, medicalPolicyPatch + insertionMarker);

const generatedRunnerPath = path.join(os.tmpdir(), `be-studios-patch-runner-${process.pid}.mjs`);
fs.writeFileSync(generatedRunnerPath, patchRunnerSource, "utf8");
await import(pathToFileURL(generatedRunnerPath).href);
