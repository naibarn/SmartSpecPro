import { readFileSync } from "node:fs";
import { normalizePackageInventory, parseSpaasManifest, validatePackageStructure } from "../../src";
import type { ManifestSupportContext, PackageEntry, SpaasManifest } from "../../src/model";

export const support:ManifestSupportContext={supportedApiVersions:["spaas.smartaihub.app/v1"],supportedSchemaVersions:["1.0"],supportedRequiredFeatures:["spaas.events.delivery-semantics/v1"],supportedOptionalFeatures:[],extensions:[{namespace:"io.modelcontextprotocol/tasks",versions:["2026-07-28"],criticalities:["optional"]}]};
export const manifestText=readFileSync(new URL("../fixtures/manifest-valid.yaml",import.meta.url),"utf8");
export function entriesFor(manifest=manifestText,extra:PackageEntry[]=[]):PackageEntry[]{return [{path:"app.manifest.yaml",kind:"file",bytes:new TextEncoder().encode(manifest)},{path:"assistants/construction.yaml",kind:"file",bytes:new TextEncoder().encode("safe: true\n")},...extra];}
export function parsedManifest(text=manifestText):SpaasManifest{const result=parseSpaasManifest(text,support);if(!result.ok)throw new Error("valid test fixture failed parser");return result.manifest;}
export function structureFor(manifest:SpaasManifest,entries=entriesFor()):ReturnType<typeof validatePackageStructure>{const inventory=normalizePackageInventory(entries);if(!inventory.ok)throw new Error("test inventory failed normalization");return validatePackageStructure(manifest,inventory.inventory);}
