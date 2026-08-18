import { Link } from "wouter";
import { ArrowLeft, BookOpen, CheckCircle2, ExternalLink, ShieldCheck, Terminal } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";

const verifyCommands = `uname -s
uname -m
node -p 'process.platform + " " + process.arch'
xcode-select -p
rustup target list --installed`;

const runtimeCommand = `RUNTIME_INPUT=/absolute/path/to/native-mac-runtime-inputs

npm --workspace apps/worker-app run runtime:release:mac -- \\
  --runtime-version 2026.08.18.1 \\
  --hyperframes-sidecar "$RUNTIME_INPUT/sidecars/hyperframes-render" \\
  --node-dir "$RUNTIME_INPUT/node" \\
  --hyperframes-dir "$RUNTIME_INPUT/hyperframes" \\
  --hyperframes-sidecar-script "$RUNTIME_INPUT/hyperframes-sidecar/render.mjs" \\
  --remotion-sidecar-script "$RUNTIME_INPUT/remotion-sidecar/render.mjs" \\
  --remotion-sidecar-dir "$RUNTIME_INPUT/remotion-sidecar" \\
  --browser-dir "$RUNTIME_INPUT/browser" \\
  --ffmpeg "$RUNTIME_INPUT/bin/ffmpeg" \\
  --ffprobe "$RUNTIME_INPUT/bin/ffprobe" \\
  --thai-fonts-dir "$RUNTIME_INPUT/fonts" \\
  --notices "$RUNTIME_INPUT/THIRD_PARTY_NOTICES.txt" \\
  --signature-file "$RUNTIME_INPUT/SHA256SUMS.sig"`;

const forbiddenRuntime = `hyperframes-wsl2
hyperframes-windows-x64
wsl.exe
*.exe
Linux ELF binaries`;

const proofCards = [
  { Icon: ShieldCheck, label: "Native only", value: "hyperframes-macos-arm64" },
  { Icon: Terminal, label: "Build target", value: "aarch64-apple-darwin" },
  { Icon: CheckCircle2, label: "Release proof", value: "sign + notarize + smoke test" },
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="my-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-100">
      <code>{children}</code>
    </pre>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 border-b border-slate-200 py-8 last:border-b-0">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-slate-700">{children}</div>
    </section>
  );
}

export default function WorkerAppMacBuildGuide() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Seo
        title="Worker App macOS Build Manual | SmartAIHub"
        description="Complete Apple Silicon build, native runtime, signing, notarization, troubleshooting, and release manual for SmartAIHub Worker App for macOS."
        canonicalPath="/docs/worker-app-macos-build"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: "SmartAIHub Worker App macOS Build Manual",
          description: "Native Apple Silicon Worker App build and runtime release manual.",
          url: "/docs/worker-app-macos-build",
        }}
      />
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link href="/docs" className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Back to documentation
          </Link>
          <a
            href="/api/desktop-releases/worker-app/macos-source/download"
            className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 hover:underline"
            download
          >
            <ExternalLink className="h-4 w-4" />
            Download source bundle
          </a>
        </div>

        <header className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
            <BookOpen className="h-4 w-4" />
            Worker App for macOS
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
            Native Apple Silicon build manual
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
            This guide prepares the source, native HyperFrames/Remotion runtime,
            Tauri app and DMG, signing, notarization, publication, and clean-machine
            verification. The final native build must run on macOS arm64 or a trusted
            macOS CI runner.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {proofCards.map(({ Icon, label, value }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Icon className="h-5 w-5 text-sky-600" />
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        </header>

        <article className="mt-6 rounded-3xl border border-slate-200 bg-white px-6 shadow-sm sm:px-10">
          <Section id="platform-rule" title="1. Non-negotiable platform rule">
            <p>
              A Mac Worker App uses only <code>hyperframes-macos-arm64</code>.
              WSL2 is a Windows runtime mode and must never be installed, copied,
              unpacked, or selected on macOS. The app settings, runtime manifest
              doctor, server archive validator, and Mac packager all reject the
              wrong platform.
            </p>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
              Never use <code>hyperframes-wsl2</code>, <code>hyperframes-windows-x64</code>,
              <code> wsl.exe</code>, <code>*.exe</code>, Linux ELF binaries, or a
              runtime under <code>/mnt/c</code> on a Mac. Hermes is separate and
              does not replace the HyperFrames render runtime.
            </div>
          </Section>

          <Section id="support" title="2. Supported hardware and software">
            <ul className="list-disc space-y-2 pl-6">
              <li>macOS 13 Ventura or newer.</li>
              <li>Apple Silicon arm64: M1, M2, M3, M4 or newer.</li>
              <li>Intel Macs are not supported by this release.</li>
              <li>Use Node 22.22.3, npm, Xcode, Rust, and the native Rust target <code>aarch64-apple-darwin</code>.</li>
            </ul>
            <p>Install the tools on the Mac itself:</p>
            <CodeBlock>{`xcode-select --install
brew install node@22 python@3.12 rustup-init
rustup-init
source "$HOME/.cargo/env"
rustup target add aarch64-apple-darwin`}</CodeBlock>
            <p>
              A distributable release additionally needs an Apple Developer team,
              Developer ID Application certificate, and notarization credentials.
              Keep private keys in the Mac Keychain or CI secret store; never put
              them in the source or runtime download.
            </p>
          </Section>

          <Section id="verify-host" title="3. Prove the host is native macOS arm64">
            <CodeBlock>{verifyCommands}</CodeBlock>
            <p>
              Expected output is <code>Darwin</code>, <code>arm64</code>,
              <code>darwin arm64</code>, a valid Xcode path, and
              <code>aarch64-apple-darwin</code>. If any command reports Linux,
              WSL, Windows, or <code>x86_64</code>, stop and move the build to an
              Apple Silicon Mac.
            </p>
          </Section>

          <Section id="source" title="4. Install and verify the source bundle">
            <p>From the extracted directory containing the root package.json:</p>
            <CodeBlock>{`npm install --legacy-peer-deps
npm --workspace @smartspec/remotion-render run build
npm run typecheck --workspace @smartspec/worker-app
npm run test --workspace @smartspec/worker-app
npm --workspace apps/worker-app run build`}</CodeBlock>
            <p>
              The source ZIP deliberately excludes node_modules, generated runtime
              packs, release binaries, environment secrets, and signing material.
              Do not copy a Windows installer or WSL2 runtime into the checkout.
            </p>
          </Section>

          <Section id="runtime-inputs" title="5. Assemble the native runtime inputs">
            <p>
              Provide native arm64 versions of the HyperFrames sidecar, Node 22+,
              Chrome for Testing/headless shell, FFmpeg, FFprobe, Thai fonts,
              HyperFrames dependencies, and the native Remotion sidecar dependency
              tree. Sharp must include the Darwin arm64 packages:
            </p>
            <CodeBlock>{`runtime-pack/node/bin/node
runtime-pack/node/node_modules/sharp/
runtime-pack/node/node_modules/@img/sharp-darwin-arm64/
runtime-pack/node/node_modules/@img/sharp-libvips-darwin-arm64/
sidecars/hyperframes-render`}</CodeBlock>
            <p>
              The final native sidecar may be supplied by the approved
              HyperFrames/Remotion build process. If it is missing, do not use a
              Linux or Windows substitute; the packager must fail.
            </p>
          </Section>

          <Section id="runtime-build" title="6. Build and verify the Mac runtime pack">
            <p>
              Read <code>MAC_RUNTIME_BUILD.md</code> in the downloaded source ZIP.
              Run the Mac-only wrapper with all native inputs:
            </p>
            <CodeBlock>{runtimeCommand}</CodeBlock>
            <p>
              The output manifest must say <code>runtimeId: hyperframes-macos-arm64</code>,
              <code>runtimePlatform: macos-arm64</code>, and <code>architecture: arm64</code>.
              The archive must include <code>manifest.json</code>, checksums,
              a real signature, native browser/FFmpeg/Node files, Sharp/libvips,
              and <code>sidecars/hyperframes-render</code>.
            </p>
            <CodeBlock>{`file runtime-pack/node/bin/node
file runtime-pack/bin/ffmpeg runtime-pack/bin/ffprobe
file runtime-pack/browser/*
file sidecars/hyperframes-render
runtime-pack/node/bin/node --version
runtime-pack/bin/ffmpeg -version`}</CodeBlock>
            <p>Every executable must report Mach-O arm64. The following are forbidden:</p>
            <CodeBlock>{forbiddenRuntime}</CodeBlock>
          </Section>

          <Section id="tauri" title="7. Build the native Tauri app and DMG">
            <CodeBlock>{`npm --workspace apps/worker-app run tauri:build -- \\
  --target aarch64-apple-darwin \\
  --bundles app,dmg`}</CodeBlock>
            <p>
              Expected artifacts are an arm64 <code>.app</code> and <code>.dmg</code>
              under <code>apps/worker-app/src-tauri/target/aarch64-apple-darwin/release/bundle/</code>.
              Inspect the final app and confirm it contains no Windows/WSL2 files.
            </p>
          </Section>

          <Section id="signing" title="8. Sign, notarize, and staple">
            <p>
              Sign nested native executables before signing the outer application,
              then verify the final app. Use a Developer ID Application identity
              for distribution outside the Mac App Store.
            </p>
            <CodeBlock>{`security find-identity -v -p codesigning
codesign --deep --force --options runtime --timestamp \\
  --sign "Developer ID Application: YOUR COMPANY (TEAMID)" \\
  "apps/worker-app/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Smart AI Hub Worker.app"
codesign --verify --deep --strict --verbose=2 \\
  "apps/worker-app/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Smart AI Hub Worker.app"
spctl --assess --type execute --verbose=4 \\
  "apps/worker-app/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Smart AI Hub Worker.app"`}</CodeBlock>
            <p>Store notarization credentials in Keychain, submit the final DMG, then staple and validate:</p>
            <CodeBlock>{`xcrun notarytool store-credentials smartaihub-notary \\
  --apple-id "YOUR_APPLE_ID" --team-id "TEAMID" \\
  --password "APP_SPECIFIC_PASSWORD"
xcrun notarytool submit "Smart AI Hub Worker.dmg" \\
  --keychain-profile smartaihub-notary --wait
xcrun stapler staple "Smart AI Hub Worker.dmg"
xcrun stapler validate "Smart AI Hub Worker.dmg"`}</CodeBlock>
          </Section>

          <Section id="release" title="9. Clean-machine release verification">
            <ol className="list-decimal space-y-2 pl-6">
              <li>Install the signed/notarized DMG on a clean Apple Silicon Mac.</li>
              <li>Run Runtime doctor and confirm <code>hyperframes-macos-arm64</code>.</li>
              <li>Run a small Remotion render and inspect the output.</li>
              <li>Confirm Hermes remains independently healthy.</li>
              <li>Confirm no Managed WSL/WSL2 control is shown on macOS.</li>
              <li>Confirm a Windows/WSL2 archive is rejected rather than installed.</li>
              <li>Compare the downloaded archive SHA-256 with the server manifest.</li>
            </ol>
          </Section>

          <Section id="troubleshooting" title="10. Troubleshooting and recovery">
            <div className="space-y-5">
              <div><h3 className="font-semibold text-slate-900">Runtime id rejected</h3><p>Settings may have been copied from Windows. Close the app, remove the old macOS Worker settings file from Application Support, reopen the native build, and install only the Mac runtime. Never edit it to a WSL2 id.</p></div>
              <div><h3 className="font-semibold text-slate-900">Packager says macOS arm64 is required</h3><p>It is running on Linux, WSL, Intel Mac, or an x86 Node/Rust toolchain. Check <code>uname -m</code> and <code>node -p process.arch</code> and rerun on Apple Silicon.</p></div>
              <div><h3 className="font-semibold text-slate-900">Mach-O/arm64 check fails</h3><p>Replace the offending Node, Chrome, headless shell, FFmpeg, FFprobe, or sidecar with a native arm64 build. Do not rename another platform's binary.</p></div>
              <div><h3 className="font-semibold text-slate-900">Sharp/libvips is missing</h3><p>Install dependencies on the Mac with the lockfile, then verify the Darwin arm64 Sharp packages under the runtime's Node tree. Never copy Linux optional dependencies.</p></div>
              <div><h3 className="font-semibold text-slate-900">Gatekeeper or notarization failure</h3><p>Rebuild if anything changed after signing; sign nested binaries, sign the outer app, submit the final DMG, staple the ticket, and validate again. Keep the Apple credentials outside the source ZIP.</p></div>
              <div><h3 className="font-semibold text-slate-900">Server returns 404</h3><p>Publish the exact filename produced by the packager alongside its matching manifest. Check the Dashboard manifest and compare its checksum; never upload a manually renamed WSL2 archive.</p></div>
            </div>
          </Section>

          <Section id="external-boundary" title="11. What cannot be bundled here">
            <p>
              The source ZIP cannot include the Xcode SDK, Apple signing identity
              or private key, notarization ticket, Keychain credentials, or a
              native sidecar that is not distributable from this repository. Those
              are external release inputs and must be provided by the Mac/CI
              release owner. The source includes the Tauri configuration, Mac
              guardrails, packager, entitlements, tests, and both manuals.
            </p>
            <p>
              Official references: {" "}
              <a className="text-sky-700 underline" href="https://v2.tauri.app/distribute/macos-application-bundle/" target="_blank" rel="noreferrer">Tauri macOS bundle</a>, {" "}
              <a className="text-sky-700 underline" href="https://v2.tauri.app/distribute/dmg/" target="_blank" rel="noreferrer">Tauri DMG</a>, {" "}
              <a className="text-sky-700 underline" href="https://developer.apple.com/developer-id/" target="_blank" rel="noreferrer">Apple Developer ID</a>, and {" "}
              <a className="text-sky-700 underline" href="https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution" target="_blank" rel="noreferrer">Apple notarization</a>.
            </p>
          </Section>
        </article>
      </main>
      <Footer />
    </div>
  );
}
