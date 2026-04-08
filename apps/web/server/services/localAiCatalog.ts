import type {
  LocalAiCatalogEntry,
  LocalAiPlatform,
} from "../../../../packages/local-ai-core/src/index";

const BASE_LOCAL_AI_CATALOG: LocalAiCatalogEntry[] = [
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
      checksumSha256:
        "2cbff161177a4d51c9d04360016185976f504517ba5758cd10c1564e5421c5a5",
    },
    runtimeConfig: {
      browser: {
        bundleUrl:
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/genai_bundle.mjs",
        bundleSha256:
          "6f48f7191e3b231ad13ba26582692392d1f9d24844810a02817f81f8f6781666",
        wasmRootUrl:
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/wasm",
        wasmVersion: "0.10.27",
        wasmAssetChecksums: {
          "genai_wasm_internal.js":
            "531d78c48eb45ecd1e167cc0fcd604673d8748677061386d947f6d22e53454d2",
          "genai_wasm_internal.wasm":
            "5e048233e783dbb97fd2c00a5a73430598f21fc0173886ab926ac535dbd24fe1",
          "genai_wasm_module_internal.js":
            "57dc0e07b1e9a60e273e22d719b5074b7542e8ffcc226f3aefd79d638ea72ecc",
          "genai_wasm_module_internal.wasm":
            "d7794834030168f312299d04d50a4533ff29484a85b60df452549cc1238c07d6",
          "genai_wasm_nosimd_internal.js":
            "1bac016de0b78c61c488f6f5080c0ae897bdc6b7d85d573e275ad8c9ce091ac7",
          "genai_wasm_nosimd_internal.wasm":
            "efc79943cd6e3097012595dabf8cf897da5d6c82fc4c01af63ba51e15809cb60",
        },
        modelAssetUrl:
          "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task",
      },
      tauri: null,
    },
    status: "allowed",
    statusReason: null,
  },
  {
    id: "gemma4-e4b-web-balanced",
    family: "gemma4",
    variant: "E4B",
    supportedPlatforms: ["web"],
    runtimeFamily: "mediapipe-webgpu",
    approximateSizeMb: 2964,
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
      checksumSha256:
        "f3bd72fc27627be2a2cc6722199a333599590ed0962ee7047b516a506b7bf086",
    },
    runtimeConfig: {
      browser: {
        bundleUrl:
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/genai_bundle.mjs",
        bundleSha256:
          "6f48f7191e3b231ad13ba26582692392d1f9d24844810a02817f81f8f6781666",
        wasmRootUrl:
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/wasm",
        wasmVersion: "0.10.27",
        wasmAssetChecksums: {
          "genai_wasm_internal.js":
            "531d78c48eb45ecd1e167cc0fcd604673d8748677061386d947f6d22e53454d2",
          "genai_wasm_internal.wasm":
            "5e048233e783dbb97fd2c00a5a73430598f21fc0173886ab926ac535dbd24fe1",
          "genai_wasm_module_internal.js":
            "57dc0e07b1e9a60e273e22d719b5074b7542e8ffcc226f3aefd79d638ea72ecc",
          "genai_wasm_module_internal.wasm":
            "d7794834030168f312299d04d50a4533ff29484a85b60df452549cc1238c07d6",
          "genai_wasm_nosimd_internal.js":
            "1bac016de0b78c61c488f6f5080c0ae897bdc6b7d85d573e275ad8c9ce091ac7",
          "genai_wasm_nosimd_internal.wasm":
            "efc79943cd6e3097012595dabf8cf897da5d6c82fc4c01af63ba51e15809cb60",
        },
        modelAssetUrl:
          "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task",
      },
      tauri: null,
    },
    status: "allowed",
    statusReason: null,
  },
  {
    id: "gemma4-e2b-tauri-fast",
    family: "gemma4",
    variant: "E2B",
    supportedPlatforms: ["tauri"],
    runtimeFamily: "tauri-native",
    approximateSizeMb: 2584,
    downloadRequired: true,
    supportsVoiceInput: true,
    defaultVoiceInputMode: "gemma4_local",
    modalities: {
      text: true,
      image: true,
      audio: true,
      ocr: "conditional",
    },
    minimumRequirements: {
      requiresSecureContext: false,
      requiresWebGpu: false,
      requiredWebGpuFeatures: [],
    },
    integrity: {
      manifestVersion: 1,
      checksumSha256:
        "ab7838cdfc8f77e54d8ca45eadceb20452d9f01e4bfade03e5dce27911b27e42",
    },
    runtimeConfig: {
      browser: null,
      tauri: {
        fromHuggingFaceRepo: "litert-community/gemma-4-E2B-it-litert-lm",
        modelFileName: "gemma-4-E2B-it.litertlm",
        cliBinaryName: "litert-lm",
      },
    },
    status: "allowed",
    statusReason: null,
  },
  {
    id: "gemma4-e4b-tauri-balanced",
    family: "gemma4",
    variant: "E4B",
    supportedPlatforms: ["tauri"],
    runtimeFamily: "tauri-native",
    approximateSizeMb: 3654,
    downloadRequired: true,
    supportsVoiceInput: true,
    defaultVoiceInputMode: "gemma4_local",
    modalities: {
      text: true,
      image: true,
      audio: true,
      ocr: "conditional",
    },
    minimumRequirements: {
      requiresSecureContext: false,
      requiresWebGpu: false,
      requiredWebGpuFeatures: [],
    },
    integrity: {
      manifestVersion: 1,
      checksumSha256:
        "f335f2bfd1b758dc6476db16c0f41854bd6237e2658d604cbe566bcefd00a7bc",
    },
    runtimeConfig: {
      browser: null,
      tauri: {
        fromHuggingFaceRepo: "litert-community/gemma-4-E4B-it-litert-lm",
        modelFileName: "gemma-4-E4B-it.litertlm",
        cliBinaryName: "litert-lm",
      },
    },
    status: "allowed",
    statusReason: null,
  },
];

export function listLocalAiCatalog(
  platform: LocalAiPlatform,
): LocalAiCatalogEntry[] {
  return BASE_LOCAL_AI_CATALOG.filter((entry) =>
    entry.supportedPlatforms.includes(platform),
  );
}

export function listAllLocalAiCatalogEntries(): LocalAiCatalogEntry[] {
  return [...BASE_LOCAL_AI_CATALOG];
}

export function getLocalAiCatalogEntryById(
  profileId: string | null | undefined,
): LocalAiCatalogEntry | null {
  if (typeof profileId !== "string" || profileId.trim().length === 0) {
    return null;
  }

  return (
    BASE_LOCAL_AI_CATALOG.find((entry) => entry.id === profileId.trim()) ?? null
  );
}

export function isKnownLocalAiProfileId(
  profileId: string | null | undefined,
): boolean {
  return getLocalAiCatalogEntryById(profileId) !== null;
}
