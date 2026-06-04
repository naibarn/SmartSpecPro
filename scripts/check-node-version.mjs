const allowedRanges = [
  { min: [20, 20, 0], maxExclusive: [21, 0, 0], label: "20.20.0 <= Node < 21" },
  { min: [22, 22, 0], maxExclusive: null, label: "Node >= 22.22.0" },
];

function parseVersion(raw) {
  const match = String(raw).trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function isAllowed(version) {
  return allowedRanges.some((range) => (
    compareVersion(version, range.min) >= 0
    && (!range.maxExclusive || compareVersion(version, range.maxExclusive) < 0)
  ));
}

if (process.env.SMARTSPEC_SKIP_NODE_VERSION_CHECK === "1") {
  process.exit(0);
}

const version = parseVersion(process.version);
if (!version || !isAllowed(version)) {
  console.error(`SmartSpecPro requires Node ${allowedRanges.map((range) => range.label).join(" or ")}.`);
  console.error(`Current Node is ${process.version}.`);
  console.error("Use the repo version file: nvm use, fnm use, mise install, asdf install, or install Node 20.20.0.");
  console.error("For emergency-only installs, set SMARTSPEC_SKIP_NODE_VERSION_CHECK=1.");
  process.exit(1);
}
