export function selectRemotionRuntimeContract({
  sourcePackageVersion,
  installedPackageVersion,
  requiredContracts,
  installedContracts,
}) {
  if (sourcePackageVersion !== installedPackageVersion) {
    throw new Error("Remotion sidecar package drift; rebuild and install the sidecar before release");
  }
  if (!Array.isArray(installedContracts) ||
      requiredContracts.some(contract => !installedContracts.includes(contract))) {
    throw new Error("Remotion sidecar contract drift; the installed sidecar does not support every required render contract");
  }
  // The primary manifest contract gates the desktop claim capability. Select
  // the newest contract actually implemented by the packaged dependency tree.
  return {
    packageVersion: installedPackageVersion,
    platformContractVersion: requiredContracts.at(-1),
  };
}
