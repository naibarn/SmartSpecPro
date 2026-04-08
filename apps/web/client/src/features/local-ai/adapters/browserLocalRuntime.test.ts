import { describe, expect, it } from "vitest";

import {
  detectBrowserLocalRuntimeAvailability,
  patchBrowserRuntimeBundleSource,
  supportsLocalVoiceRuntime,
} from "./browserLocalRuntime";

describe("browserLocalRuntime", () => {
  const browserVoiceCatalog = [
    {
      id: "gemma4-e2b-web-fast",
      family: "gemma4",
      variant: "E2B",
      supportedPlatforms: ["web"],
      runtimeFamily: "mediapipe-webgpu",
      approximateSizeMb: 2004,
      downloadRequired: true,
      supportsVoiceInput: true,
      defaultVoiceInputMode: "gemma4_local",
      modalities: {
        text: true,
        image: false,
        audio: true,
        ocr: "conditional",
      },
      minimumRequirements: {
        requiresSecureContext: true,
        requiresWebGpu: true,
        requiredWebGpuFeatures: [],
      },
      integrity: {
        manifestVersion: 1,
        checksumSha256: "abc",
      },
      runtimeConfig: {
        browser: {
          bundleUrl:
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/genai_bundle.cjs",
          bundleSha256: "bundle-checksum",
          wasmRootUrl:
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/wasm",
          wasmVersion: "0.10.27",
          wasmAssetChecksums: {
            "genai_wasm_internal.js": "wasm-checksum",
          },
          modelAssetUrl:
            "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task",
        },
      },
      status: "allowed",
      statusReason: null,
    },
  ] as const;

  it("reports device unavailability when WebGPU adapter exists but device creation fails", () => {
    expect(
      detectBrowserLocalRuntimeAvailability({
        secureContext: true,
        webgpu: true,
        webgpuAdapterAvailable: true,
        webgpuDeviceAvailable: false,
      }),
    ).toEqual({
      available: false,
      reason: "webgpu_device_unavailable",
    });
  });

  it("reports browser local voice support when an eligible voice profile is available", () => {
    expect(
      supportsLocalVoiceRuntime({
        catalog: [...browserVoiceCatalog],
        capability: {
          supported: true,
          platform: "web",
          secureContext: true,
          webgpu: true,
          webgpuAdapterAvailable: true,
          webgpuDeviceAvailable: true,
          webgpuProfileRequirementsMet: true,
          eligibleProfiles: ["gemma4-e2b-web-fast"],
          eligibleVoiceProfiles: ["gemma4-e2b-web-fast"],
          reasons: [],
          storageEstimateMb: 2048,
        },
      }),
    ).toBe(true);
  });

  it("patches the legacy browser runtime loader to restore ModuleFactory in module workers", () => {
    const input =
      'async function lr(t){if("function"!=typeof importScripts){const e=document.createElement("script");return e.src=t.toString(),e.crossOrigin="anonymous",new Promise(((t,n)=>{e.addEventListener("load",(()=>{t()}),!1),e.addEventListener("error",(t=>{n(t)}),!1),document.body.appendChild(e)}))}try{importScripts(t.toString())}catch(e){if(!(e instanceof TypeError))throw e;await self.import(t.toString())}}';
    const output = patchBrowserRuntimeBundleSource(input);
    expect(output).toContain('runtime_loader_fetch_failed:');
    expect(output).toContain("globalThis.ModuleFactory");
    expect(output).toContain("export default");
    expect(output).not.toContain("self.import(");
    expect(output).not.toContain('document.createElement("script")');
  });

  it("patches the subgroup path so stable browser runtime can disable experimental WGSL subgroups", () => {
    const input =
      't.features.has("subgroups")&&(console.warn("Experimental Chromium WGSL subgroup support detected. Enabling this feature in the inference engine."),e.requiredFeatures=["shader-f16","subgroups"])';
    const output = patchBrowserRuntimeBundleSource(input);
    expect(output).toContain("__SMARTSPEC_LOCAL_AI_DISABLE_SUBGROUPS__");
    expect(output).toContain("subgroups");
    expect(output).toContain("stable browser runtime disabled experimental Chromium WGSL subgroup support");
  });

  it("patches the hard-coded high-performance adapter request so stable browser runtime can avoid the Chromium warning path", () => {
    const input = 'Kr.X({powerPreference:"high-performance"})';
    const output = patchBrowserRuntimeBundleSource(input);
    expect(output).toContain("__SMARTSPEC_LOCAL_AI_AVOID_POWER_PREFERENCE__");
    expect(output).not.toContain('Kr.X({powerPreference:"high-performance"})');
  });
});
