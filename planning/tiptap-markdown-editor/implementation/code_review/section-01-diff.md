diff --git a/apps/web/client/src/components/editor/__tests__/tiptap-setup.test.tsx b/apps/web/client/src/components/editor/__tests__/tiptap-setup.test.tsx
new file mode 100644
index 00000000..4287540d
--- /dev/null
+++ b/apps/web/client/src/components/editor/__tests__/tiptap-setup.test.tsx
@@ -0,0 +1,83 @@
+import React from "react";
+import { renderHook } from "@testing-library/react";
+import { useEditor } from "@tiptap/react";
+import StarterKit from "@tiptap/starter-kit";
+import { describe, it, expect } from "vitest";
+
+describe("Tiptap Setup", () => {
+  it("useEditor() with immediatelyRender: false returns an Editor instance", () => {
+    const { result } = renderHook(() =>
+      useEditor({
+        extensions: [StarterKit],
+        immediatelyRender: false,
+      }),
+    );
+    expect(result.current).not.toBeNull();
+    expect(result.current).toBeDefined();
+  });
+
+  it("useEditor() with StarterKit accepts setContent() without error", () => {
+    const { result } = renderHook(() =>
+      useEditor({
+        extensions: [StarterKit],
+        immediatelyRender: false,
+      }),
+    );
+    expect(() => {
+      result.current?.commands.setContent("<p>Hello</p>");
+    }).not.toThrow();
+  });
+
+  it("useEditor() with immediatelyRender: false does not throw in React.StrictMode", () => {
+    const wrapper = ({ children }: { children: React.ReactNode }) => (
+      <React.StrictMode>{children}</React.StrictMode>
+    );
+    const { result } = renderHook(
+      () =>
+        useEditor({
+          extensions: [StarterKit],
+          immediatelyRender: false,
+        }),
+      { wrapper },
+    );
+    expect(result.current).not.toBeNull();
+  });
+
+  it("editor.getHTML() returns valid HTML after setContent", () => {
+    const { result } = renderHook(() =>
+      useEditor({
+        extensions: [StarterKit],
+        immediatelyRender: false,
+      }),
+    );
+    result.current?.commands.setContent("<p>Hello</p>");
+    const html = result.current?.getHTML();
+    expect(html).toContain("<p>Hello</p>");
+  });
+
+  it("editor.isEditable is false when editable: false is passed", () => {
+    const { result } = renderHook(() =>
+      useEditor({
+        extensions: [StarterKit],
+        immediatelyRender: false,
+        editable: false,
+      }),
+    );
+    expect(result.current?.isEditable).toBe(false);
+  });
+
+  it("editor.isEditable is true when editable: true is passed", () => {
+    const { result } = renderHook(() =>
+      useEditor({
+        extensions: [StarterKit],
+        immediatelyRender: false,
+        editable: true,
+      }),
+    );
+    expect(result.current?.isEditable).toBe(true);
+  });
+
+  it("editor CSS file can be imported without errors", async () => {
+    await expect(import("../editor.css")).resolves.not.toThrow();
+  });
+});
diff --git a/apps/web/client/src/components/editor/editor.css b/apps/web/client/src/components/editor/editor.css
new file mode 100644
index 00000000..32e418ff
--- /dev/null
+++ b/apps/web/client/src/components/editor/editor.css
@@ -0,0 +1,145 @@
+/* Tiptap ProseMirror base styles — scoped to .tiptap-editor */
+
+.tiptap-editor .ProseMirror {
+  min-height: 200px;
+  padding: 1rem;
+  outline: none;
+}
+
+.tiptap-editor .ProseMirror:focus {
+  outline: none;
+}
+
+/* Typography */
+
+.tiptap-editor .ProseMirror h1 {
+  font-size: 1.875rem;
+  line-height: 2.25rem;
+  font-weight: 700;
+  margin-bottom: 0.75rem;
+}
+
+.tiptap-editor .ProseMirror h2 {
+  font-size: 1.5rem;
+  line-height: 2rem;
+  font-weight: 600;
+  margin-bottom: 0.5rem;
+}
+
+.tiptap-editor .ProseMirror h3 {
+  font-size: 1.25rem;
+  line-height: 1.75rem;
+  font-weight: 600;
+  margin-bottom: 0.5rem;
+}
+
+.tiptap-editor .ProseMirror h4 {
+  font-size: 1.125rem;
+  line-height: 1.75rem;
+  font-weight: 500;
+  margin-bottom: 0.5rem;
+}
+
+.tiptap-editor .ProseMirror p {
+  margin-bottom: 0.75rem;
+}
+
+/* Lists */
+
+.tiptap-editor .ProseMirror ul {
+  list-style-type: disc;
+  padding-left: 1.5rem;
+  margin-bottom: 0.75rem;
+}
+
+.tiptap-editor .ProseMirror ol {
+  list-style-type: decimal;
+  padding-left: 1.5rem;
+  margin-bottom: 0.75rem;
+}
+
+.tiptap-editor .ProseMirror li {
+  margin-bottom: 0.25rem;
+}
+
+/* Block elements */
+
+.tiptap-editor .ProseMirror blockquote {
+  border-left: 3px solid var(--border);
+  padding-left: 1rem;
+  color: var(--muted-foreground);
+  font-style: italic;
+  margin-bottom: 0.75rem;
+}
+
+.tiptap-editor .ProseMirror pre > code {
+  display: block;
+  background-color: var(--muted);
+  padding: 0.75rem 1rem;
+  border-radius: 0.375rem;
+  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
+    "Liberation Mono", monospace;
+  font-size: 0.875rem;
+  overflow-x: auto;
+}
+
+.tiptap-editor .ProseMirror pre {
+  margin-bottom: 0.75rem;
+}
+
+.tiptap-editor .ProseMirror code {
+  background-color: var(--muted);
+  padding: 0.125rem 0.375rem;
+  border-radius: 0.25rem;
+  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
+    "Liberation Mono", monospace;
+  font-size: 0.875em;
+}
+
+.tiptap-editor .ProseMirror hr {
+  border: none;
+  border-top: 1px solid var(--border);
+  margin: 1.5rem 0;
+}
+
+/* Tables */
+
+.tiptap-editor .ProseMirror table {
+  width: 100%;
+  border-collapse: collapse;
+  margin-bottom: 0.75rem;
+}
+
+.tiptap-editor .ProseMirror th,
+.tiptap-editor .ProseMirror td {
+  border: 1px solid var(--border);
+  padding: 0.5rem 0.75rem;
+}
+
+.tiptap-editor .ProseMirror th {
+  font-weight: 600;
+  background-color: var(--muted);
+}
+
+/* Links */
+
+.tiptap-editor .ProseMirror a {
+  color: var(--primary);
+  text-decoration: none;
+}
+
+.tiptap-editor .ProseMirror a:hover {
+  text-decoration: underline;
+}
+
+/* Placeholder */
+
+.tiptap-editor
+  .ProseMirror
+  p.is-editor-empty:first-child::before {
+  content: attr(data-placeholder);
+  color: var(--muted-foreground);
+  float: left;
+  height: 0;
+  pointer-events: none;
+}
diff --git a/apps/web/package.json b/apps/web/package.json
index 838c9f04..90df6975 100644
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -73,6 +73,18 @@
     "@tauri-apps/api": "^2.9.1",
     "@tauri-apps/plugin-dialog": "^2.6.0",
     "@tauri-apps/plugin-fs": "^2.4.5",
+    "@tiptap/extension-image": "^3.20.4",
+    "@tiptap/extension-link": "^3.20.4",
+    "@tiptap/extension-placeholder": "^3.20.4",
+    "@tiptap/extension-table": "^3.20.4",
+    "@tiptap/extension-table-cell": "^3.20.4",
+    "@tiptap/extension-table-header": "^3.20.4",
+    "@tiptap/extension-table-row": "^3.20.4",
+    "@tiptap/extension-underline": "^3.20.4",
+    "@tiptap/pm": "^3.20.4",
+    "@tiptap/react": "^3.20.4",
+    "@tiptap/starter-kit": "^3.20.4",
+    "@tiptap/suggestion": "^3.20.4",
     "@trpc/client": "^11.6.0",
     "@trpc/react-query": "^11.6.0",
     "@trpc/server": "^11.6.0",
@@ -148,6 +160,8 @@
     "swagger-ui-express": "^5.0.1",
     "tailwind-merge": "^3.3.1",
     "tailwindcss-animate": "^1.0.7",
+    "tippy.js": "^6.3.7",
+    "tiptap-markdown": "^0.9.0",
     "vaul": "^1.1.2",
     "wouter": "^3.3.5",
     "ws": "^8.19.0",
diff --git a/package-lock.json b/package-lock.json
index 4405216f..14c84d57 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -132,6 +132,18 @@
         "@tauri-apps/api": "^2.9.1",
         "@tauri-apps/plugin-dialog": "^2.6.0",
         "@tauri-apps/plugin-fs": "^2.4.5",
+        "@tiptap/extension-image": "^3.20.4",
+        "@tiptap/extension-link": "^3.20.4",
+        "@tiptap/extension-placeholder": "^3.20.4",
+        "@tiptap/extension-table": "^3.20.4",
+        "@tiptap/extension-table-cell": "^3.20.4",
+        "@tiptap/extension-table-header": "^3.20.4",
+        "@tiptap/extension-table-row": "^3.20.4",
+        "@tiptap/extension-underline": "^3.20.4",
+        "@tiptap/pm": "^3.20.4",
+        "@tiptap/react": "^3.20.4",
+        "@tiptap/starter-kit": "^3.20.4",
+        "@tiptap/suggestion": "^3.20.4",
         "@trpc/client": "^11.6.0",
         "@trpc/react-query": "^11.6.0",
         "@trpc/server": "^11.6.0",
@@ -207,6 +219,8 @@
         "swagger-ui-express": "^5.0.1",
         "tailwind-merge": "^3.3.1",
         "tailwindcss-animate": "^1.0.7",
+        "tippy.js": "^6.3.7",
+        "tiptap-markdown": "^0.9.0",
         "vaul": "^1.1.2",
         "wouter": "^3.3.5",
         "ws": "^8.19.0",
@@ -2499,14 +2513,6 @@
         "@types/node": "*"
       }
     },
-    "apps/web/node_modules/@types/react-dom": {
-      "version": "19.2.3",
-      "dev": true,
-      "license": "MIT",
-      "peerDependencies": {
-        "@types/react": "^19.2.0"
-      }
-    },
     "apps/web/node_modules/@types/sanitize-html": {
       "version": "2.16.0",
       "license": "MIT",
@@ -7218,6 +7224,7 @@
       "resolved": "https://registry.npmjs.org/@floating-ui/dom/-/dom-1.7.5.tgz",
       "integrity": "sha512-N0bD2kIPInNHUHehXhMke1rBGs1dwqvC9O9KYMyyjK7iXt7GAhnro7UlcuYcGdS/yYOlq0MAVgrow8IbWJwyqg==",
       "license": "MIT",
+      "peer": true,
       "dependencies": {
         "@floating-ui/core": "^1.7.4",
         "@floating-ui/utils": "^0.2.10"
@@ -9075,6 +9082,16 @@
         "node": ">=14"
       }
     },
+    "node_modules/@popperjs/core": {
+      "version": "2.11.8",
+      "resolved": "https://registry.npmjs.org/@popperjs/core/-/core-2.11.8.tgz",
+      "integrity": "sha512-P1st0aksCrn9sGZhp8GMYwBnQsbvAWsZAX44oXNNvLHGqAOcoVxmjZiohstwQ7SqKnbR47akdNi+uleWD8+g6A==",
+      "license": "MIT",
+      "funding": {
+        "type": "opencollective",
+        "url": "https://opencollective.com/popperjs"
+      }
+    },
     "node_modules/@posthog/core": {
       "version": "1.22.0",
       "resolved": "https://registry.npmjs.org/@posthog/core/-/core-1.22.0.tgz",
@@ -10906,6 +10923,12 @@
         "react-dom": ">=17"
       }
     },
+    "node_modules/@remirror/core-constants": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/@remirror/core-constants/-/core-constants-3.0.0.tgz",
+      "integrity": "sha512-42aWfPrimMfDKDi4YegyS7x+/0tlzaqwPQCULLanv3DMIlu96KTJR0fM5isWX2UViOqlGnX6YFgqWepcX+XMNg==",
+      "license": "MIT"
+    },
     "node_modules/@rollup/rollup-android-arm-eabi": {
       "version": "4.57.1",
       "resolved": "https://registry.npmjs.org/@rollup/rollup-android-arm-eabi/-/rollup-android-arm-eabi-4.57.1.tgz",
@@ -12502,6 +12525,538 @@
         "@testing-library/dom": ">=7.21.4"
       }
     },
+    "node_modules/@tiptap/core": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/core/-/core-3.20.4.tgz",
+      "integrity": "sha512-3i/DG89TFY/b34T5P+j35UcjYuB5d3+9K8u6qID+iUqNPiza015HPIZLuPfE5elNwVdV3EXIoPo0LLeBLgXXAg==",
+      "license": "MIT",
+      "peer": true,
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/pm": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-blockquote": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-blockquote/-/extension-blockquote-3.20.4.tgz",
+      "integrity": "sha512-9sskyyhYj2oKat//lyZVXCp9YrPt4oJAZnGHYWXS0xlskjsLElrfKKlM4vpbhGss3VrhQRoEGqWLnIaJYPF1zw==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-bold": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-bold/-/extension-bold-3.20.4.tgz",
+      "integrity": "sha512-Md7/mNAeJCY+VLJc8JRGI+8XkVPKiOGB1NgqQPdh3aYtxXQDChQOZoJEQl6TuudDxZ85bLZB67NjZlx3jo8/0g==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-bubble-menu": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-bubble-menu/-/extension-bubble-menu-3.20.4.tgz",
+      "integrity": "sha512-EXywPlI8wjPcAb8ozymgVhjtMjFrnhtoyNTy8ZcObdpUi5CdO9j892Y7aPbKe5hLhlDpvJk7rMfir4FFKEmfng==",
+      "license": "MIT",
+      "optional": true,
+      "dependencies": {
+        "@floating-ui/dom": "^1.0.0"
+      },
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4",
+        "@tiptap/pm": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-bullet-list": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-bullet-list/-/extension-bullet-list-3.20.4.tgz",
+      "integrity": "sha512-1RTGrur1EKoxfnLZ3M6xeNj8GITAz74jH2DHGcjLsd2Xr7Q7BozGaIq6GkkvKguMwbI1zCOxTHFCpUETXAIQQA==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/extension-list": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-code": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-code/-/extension-code-3.20.4.tgz",
+      "integrity": "sha512-7j8Hi964bH1SZ9oLdZC1fkqWz27mliSDV7M8lmL/M14+Qw42D/VOAKS4Aw9OCFtHMlTsjLR6qsoVxL8Lpkt6NA==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-code-block": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-code-block/-/extension-code-block-3.20.4.tgz",
+      "integrity": "sha512-Zlw3FrXTy01+o1yISeX/LC+iJeHA+ym602bMXGmtA6lyl7QSOSO7WExweJ6xeJGhbCjldwT5al6fkRAs8iGJZg==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4",
+        "@tiptap/pm": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-document": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-document/-/extension-document-3.20.4.tgz",
+      "integrity": "sha512-zF1CIFVLt8MfSpWWnPwtGyxPOsT0xYM2qJKcXf2yZcTG37wDKmUi6heG53vGigIavbQlLaAFvs+1mNdOu2x/0A==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-dropcursor": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-dropcursor/-/extension-dropcursor-3.20.4.tgz",
+      "integrity": "sha512-TgMwvZ8myXYdmd6bUV7qkpZXv7ZUiSmX/8eo+iPEzYo2CnDLAGvDKgC50nfq/g87SDvfBgPuAiBfFvsMQQWaTw==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/extensions": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-floating-menu": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-floating-menu/-/extension-floating-menu-3.20.4.tgz",
+      "integrity": "sha512-AaPTFhoO8DBIElJyd/RTVJjkctvJuL+GHURX0npbtTxXq5HXbebVwf2ARNR7jMd/GThsmBaNJiGxZg4A2oeDqQ==",
+      "license": "MIT",
+      "optional": true,
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@floating-ui/dom": "^1.0.0",
+        "@tiptap/core": "^3.20.4",
+        "@tiptap/pm": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-gapcursor": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-gapcursor/-/extension-gapcursor-3.20.4.tgz",
+      "integrity": "sha512-JJ6f1iQ1e0s4kISgq55U3UYGwWV/N9f0PYMtB6e3L+SBQjXnywaLK0g6vfN6IvTCC2vdIuqeSOX8VlSO97sJLw==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/extensions": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-hard-break": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-hard-break/-/extension-hard-break-3.20.4.tgz",
+      "integrity": "sha512-gJbq58d8zB1gzyqVEopowej5CpW4/Fpg6oGJvlZxaCukqd0gJRWGC89K+jE62YA1Td4sfcKrekKvN7jm2y/ZUg==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-heading": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-heading/-/extension-heading-3.20.4.tgz",
+      "integrity": "sha512-xsnkmTGggJc5P2iCwS1lv8KFG31xC/GNPJKoi/3UH67j/lKDhA3AdtshsLeyv2FKtTtYDb8oV0IqzHB1MM6a7w==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-horizontal-rule": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-horizontal-rule/-/extension-horizontal-rule-3.20.4.tgz",
+      "integrity": "sha512-y6joCi49haAA0bo3EGUY+dWUMHH1GPUc84hxrBY/0pMs+Bn+kQ1+DQJErZDTWGJrlHPWU/yekBZT72SNdp0DNA==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4",
+        "@tiptap/pm": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-image": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-image/-/extension-image-3.20.4.tgz",
+      "integrity": "sha512-57w2TevHQljTh6Xiry9duIm7NNOQAUSTwtwRn4GGLoKwHR8qXTxzp513ASrFOgR2kgs2TP471Au6RHf947P+jg==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-italic": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-italic/-/extension-italic-3.20.4.tgz",
+      "integrity": "sha512-4ZqiWr7cmqPFux8tj1ZLiYytyWf343IvQemNX6AvVWvscrJcrfj3YX4Le2BA0RW3A3M6RpLQXXozuF8vxYFDeQ==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-link": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-link/-/extension-link-3.20.4.tgz",
+      "integrity": "sha512-JNDSkWrVdb8NSvbQXwHWvK5tCMbTWwOHFOweknQZ1JPK4dei9FJVofYQaHyW4bJBdcCjds3NZSnXE8DM9iAWmg==",
+      "license": "MIT",
+      "dependencies": {
+        "linkifyjs": "^4.3.2"
+      },
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4",
+        "@tiptap/pm": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-list": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-list/-/extension-list-3.20.4.tgz",
+      "integrity": "sha512-X+5plTKhOioNcQ4KsAFJJSb/3+zR8Xhdpow4HzXtoV1KcbdDey1fhZdpsfkbrzCL0s6/wAgwZuAchCK7HujurQ==",
+      "license": "MIT",
+      "peer": true,
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4",
+        "@tiptap/pm": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-list-item": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-list-item/-/extension-list-item-3.20.4.tgz",
+      "integrity": "sha512-QoTc5RACXaZF+vIIBBxjGO7D0oWFUDgBKJCpvUZ0CoGGKosnfe4a9I5THFyLj4201cf0oUqgf1oZhTqETGxlVw==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/extension-list": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-list-keymap": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-list-keymap/-/extension-list-keymap-3.20.4.tgz",
+      "integrity": "sha512-RIqXM649+8IP7p/KVfaGlJiwjCylm1m6OPlaoM3K8O7oEOGRQzNeexexECCD2jsXRxew4E+vBNMD2orXqJmu8A==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/extension-list": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-ordered-list": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-ordered-list/-/extension-ordered-list-3.20.4.tgz",
+      "integrity": "sha512-3budNL8BgBon3TcXZ4hjT0YpFvx1Ka3uSIECKDxHgES+OQcR+6cagxSb60gFEccf3Dr0PIwcVTY6g14lC1qKRQ==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/extension-list": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-paragraph": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-paragraph/-/extension-paragraph-3.20.4.tgz",
+      "integrity": "sha512-lm6fOScWuZAF/Sfp97igUwFd3L1QHIVLAWP5NVdh0DTLrEIt4rMBmsww+yOpMQRhvz2uTgMbMXynrimhzi/QVw==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-placeholder": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-placeholder/-/extension-placeholder-3.20.4.tgz",
+      "integrity": "sha512-GB0KWtqm83YHG8cnqBLijvUBm+xvLfQHDfFRRH2fb3EzH3eIsM9jKRC31ADT27RSV1zVpHMFGcP3/pWpdrN1Lw==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/extensions": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-strike": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-strike/-/extension-strike-3.20.4.tgz",
+      "integrity": "sha512-It1Px9uDGTsVqyyg6cy7DigLoenljpQwqdI0jssM7QclZrHnsrye9fZxBBiiuCzzV1305MxKgHvratkHwqmVNA==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-table": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-table/-/extension-table-3.20.4.tgz",
+      "integrity": "sha512-vEHXRL9k9G02pp3P+DyUnN4YRaRAHGfTBC6gck0s9TpsCM9NIchL0qI1fb/u46Bu6UaoMMk58DGr7xaJ29g7KQ==",
+      "license": "MIT",
+      "peer": true,
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4",
+        "@tiptap/pm": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-table-cell": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-table-cell/-/extension-table-cell-3.20.4.tgz",
+      "integrity": "sha512-R+AKOPKCq2NwETa4/nsidXnYe7UP8CxdbvJI1r6DMYipdj4ksQI24ij91hkwDLkeAhJyNGKub4soEMRdLgcQyQ==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/extension-table": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-table-header": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-table-header/-/extension-table-header-3.20.4.tgz",
+      "integrity": "sha512-f8xlcNfmh2MD+fzPYXhy1zvao5DlWf+Sdd7eQ4G3baui/PdgBpJEroVCPYZIOazVRHL43MFxtvPeSJ5RN6J+bw==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/extension-table": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-table-row": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-table-row/-/extension-table-row-3.20.4.tgz",
+      "integrity": "sha512-bW9pXTMpNmDoZrLVPYylkfhiSwPxTYpubFduW3cjsiSJK046kSw5zOlvlv4+9vZI1TSlA+BFykPeW34YqLbr6Q==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/extension-table": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-text": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-text/-/extension-text-3.20.4.tgz",
+      "integrity": "sha512-jchJcBZixDEO2J66Zx5dchsI2mA6IYsROqF8P1poxL4ienH7RVQRCTsBNnSfIeOtREKKWeOU/tEs5fcpvvGwIQ==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extension-underline": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extension-underline/-/extension-underline-3.20.4.tgz",
+      "integrity": "sha512-0OjMc3FDujX16G+jhvqcY/mLot8SrNtDu8ggUwNLAfiI/QIvMVgk7giFD71DATC/4Nb8i/iwAEegTD8MxBIXCg==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/extensions": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/extensions/-/extensions-3.20.4.tgz",
+      "integrity": "sha512-8p6hVT65DjuQjtEdlH6ewX9SOJHlVQAOee3sWIJQmeJNRnZNvqPIBLleebUqDiljNTpxBv6s6QWkSTKgf3btwg==",
+      "license": "MIT",
+      "peer": true,
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4",
+        "@tiptap/pm": "^3.20.4"
+      }
+    },
+    "node_modules/@tiptap/pm": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/pm/-/pm-3.20.4.tgz",
+      "integrity": "sha512-rCHYSBToilBEuI6PtjziHDdRkABH/XqwJ7dG4Amn/SD3yGiZKYCiEApQlTUS2zZeo8DsLeuqqqB4vEOeD4OEPg==",
+      "license": "MIT",
+      "peer": true,
+      "dependencies": {
+        "prosemirror-changeset": "^2.3.0",
+        "prosemirror-collab": "^1.3.1",
+        "prosemirror-commands": "^1.6.2",
+        "prosemirror-dropcursor": "^1.8.1",
+        "prosemirror-gapcursor": "^1.3.2",
+        "prosemirror-history": "^1.4.1",
+        "prosemirror-inputrules": "^1.4.0",
+        "prosemirror-keymap": "^1.2.2",
+        "prosemirror-markdown": "^1.13.1",
+        "prosemirror-menu": "^1.2.4",
+        "prosemirror-model": "^1.24.1",
+        "prosemirror-schema-basic": "^1.2.3",
+        "prosemirror-schema-list": "^1.5.0",
+        "prosemirror-state": "^1.4.3",
+        "prosemirror-tables": "^1.6.4",
+        "prosemirror-trailing-node": "^3.0.0",
+        "prosemirror-transform": "^1.10.2",
+        "prosemirror-view": "^1.38.1"
+      },
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      }
+    },
+    "node_modules/@tiptap/react": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/react/-/react-3.20.4.tgz",
+      "integrity": "sha512-1B8iWsHWwb5TeyVaUs8BRPzwWo4PsLQcl03urHaz0zTJ8DauopqvxzV3+lem1OkzRHn7wnrapDvwmIGoROCaQw==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/use-sync-external-store": "^0.0.6",
+        "fast-equals": "^5.3.3",
+        "use-sync-external-store": "^1.4.0"
+      },
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "optionalDependencies": {
+        "@tiptap/extension-bubble-menu": "^3.20.4",
+        "@tiptap/extension-floating-menu": "^3.20.4"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4",
+        "@tiptap/pm": "^3.20.4",
+        "@types/react": "^17.0.0 || ^18.0.0 || ^19.0.0",
+        "@types/react-dom": "^17.0.0 || ^18.0.0 || ^19.0.0",
+        "react": "^17.0.0 || ^18.0.0 || ^19.0.0",
+        "react-dom": "^17.0.0 || ^18.0.0 || ^19.0.0"
+      }
+    },
+    "node_modules/@tiptap/starter-kit": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/starter-kit/-/starter-kit-3.20.4.tgz",
+      "integrity": "sha512-WcyK6hsTl8eBsQhQ+d9Sq8fYZKOYdL+D45MyH3hz583elXqJlW3h3JPFYb0o87gddGxn8Mm57OA/gA1zEdeDMw==",
+      "license": "MIT",
+      "dependencies": {
+        "@tiptap/core": "^3.20.4",
+        "@tiptap/extension-blockquote": "^3.20.4",
+        "@tiptap/extension-bold": "^3.20.4",
+        "@tiptap/extension-bullet-list": "^3.20.4",
+        "@tiptap/extension-code": "^3.20.4",
+        "@tiptap/extension-code-block": "^3.20.4",
+        "@tiptap/extension-document": "^3.20.4",
+        "@tiptap/extension-dropcursor": "^3.20.4",
+        "@tiptap/extension-gapcursor": "^3.20.4",
+        "@tiptap/extension-hard-break": "^3.20.4",
+        "@tiptap/extension-heading": "^3.20.4",
+        "@tiptap/extension-horizontal-rule": "^3.20.4",
+        "@tiptap/extension-italic": "^3.20.4",
+        "@tiptap/extension-link": "^3.20.4",
+        "@tiptap/extension-list": "^3.20.4",
+        "@tiptap/extension-list-item": "^3.20.4",
+        "@tiptap/extension-list-keymap": "^3.20.4",
+        "@tiptap/extension-ordered-list": "^3.20.4",
+        "@tiptap/extension-paragraph": "^3.20.4",
+        "@tiptap/extension-strike": "^3.20.4",
+        "@tiptap/extension-text": "^3.20.4",
+        "@tiptap/extension-underline": "^3.20.4",
+        "@tiptap/extensions": "^3.20.4",
+        "@tiptap/pm": "^3.20.4"
+      },
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      }
+    },
+    "node_modules/@tiptap/suggestion": {
+      "version": "3.20.4",
+      "resolved": "https://registry.npmjs.org/@tiptap/suggestion/-/suggestion-3.20.4.tgz",
+      "integrity": "sha512-7uqgLwjEAvsosrfoVrYVBQtAKI2pJFHOM8wgsQMLv1pQL8mfRz5ByD2xet4DOKb23q4mDvrvzp6z0kvCp0hMDw==",
+      "license": "MIT",
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/ueberdosis"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.20.4",
+        "@tiptap/pm": "^3.20.4"
+      }
+    },
     "node_modules/@tootallnate/once": {
       "version": "2.0.0",
       "resolved": "https://registry.npmjs.org/@tootallnate/once/-/once-2.0.0.tgz",
@@ -12923,12 +13478,28 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/@types/linkify-it": {
+      "version": "5.0.0",
+      "resolved": "https://registry.npmjs.org/@types/linkify-it/-/linkify-it-5.0.0.tgz",
+      "integrity": "sha512-sVDA58zAw4eWAffKOaQH5/5j3XeayukzDk+ewSsnv3p4yJEZHCCzMDiZM8e0OUrRvmpGZ85jf4yDHkHsgBNr9Q==",
+      "license": "MIT"
+    },
     "node_modules/@types/long": {
       "version": "4.0.2",
       "resolved": "https://registry.npmjs.org/@types/long/-/long-4.0.2.tgz",
       "integrity": "sha512-MqTGEo5bj5t157U6fA/BiDynNkn0YknVdh48CMPkTSpFTVmvao5UQmm7uEF6xBEo7qIMAlY/JSleYaE6VOdpaA==",
       "license": "MIT"
     },
+    "node_modules/@types/markdown-it": {
+      "version": "14.1.2",
+      "resolved": "https://registry.npmjs.org/@types/markdown-it/-/markdown-it-14.1.2.tgz",
+      "integrity": "sha512-promo4eFwuiW+TfGxhi+0x3czqTYJkG8qB17ZUJiVF10Xm7NLVRSLUsfRTU/6h1e24VvRnXCx+hG7li58lkzog==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/linkify-it": "^5",
+        "@types/mdurl": "^2"
+      }
+    },
     "node_modules/@types/mdast": {
       "version": "4.0.4",
       "resolved": "https://registry.npmjs.org/@types/mdast/-/mdast-4.0.4.tgz",
@@ -12938,6 +13509,12 @@
         "@types/unist": "*"
       }
     },
+    "node_modules/@types/mdurl": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/@types/mdurl/-/mdurl-2.0.0.tgz",
+      "integrity": "sha512-RGdgjQUZba5p6QEFAVx2OGb8rQDL/cPRG7GiedRzMcJ1tYnUANBncjbSB1NRGwbvjcPeikRABz2nshyPk1bhWg==",
+      "license": "MIT"
+    },
     "node_modules/@types/methods": {
       "version": "1.1.4",
       "resolved": "https://registry.npmjs.org/@types/methods/-/methods-1.1.4.tgz",
@@ -13036,6 +13613,16 @@
         "csstype": "^3.2.2"
       }
     },
+    "node_modules/@types/react-dom": {
+      "version": "19.2.3",
+      "resolved": "https://registry.npmjs.org/@types/react-dom/-/react-dom-19.2.3.tgz",
+      "integrity": "sha512-jp2L/eY6fn+KgVVQAOqYItbF0VY/YApe5Mz2F0aykSO8gx31bYCZyvSeYxCHKvzHG5eZjc+zyaS5BrBWya2+kQ==",
+      "license": "MIT",
+      "peer": true,
+      "peerDependencies": {
+        "@types/react": "^19.2.0"
+      }
+    },
     "node_modules/@types/react-syntax-highlighter": {
       "version": "15.5.13",
       "resolved": "https://registry.npmjs.org/@types/react-syntax-highlighter/-/react-syntax-highlighter-15.5.13.tgz",
@@ -13156,6 +13743,12 @@
       "integrity": "sha512-ko/gIFJRv177XgZsZcBwnqJN5x/Gien8qNOn0D5bQU/zAzVf9Zt3BlcUiLqhV9y4ARk0GbT3tnUiPNgnTXzc/Q==",
       "license": "MIT"
     },
+    "node_modules/@types/use-sync-external-store": {
+      "version": "0.0.6",
+      "resolved": "https://registry.npmjs.org/@types/use-sync-external-store/-/use-sync-external-store-0.0.6.tgz",
+      "integrity": "sha512-zFDAD+tlpf2r4asuHEj0XH6pY6i0g5NeAHPn+15wk3BV6JA69eERFXC1gyGThDkVa1zCyKr5jox1+2LbV/AMLg==",
+      "license": "MIT"
+    },
     "node_modules/@types/whatwg-mimetype": {
       "version": "3.0.2",
       "resolved": "https://registry.npmjs.org/@types/whatwg-mimetype/-/whatwg-mimetype-3.0.2.tgz",
@@ -15308,14 +15901,14 @@
       }
     },
     "node_modules/enhanced-resolve": {
-      "version": "5.18.4",
-      "resolved": "https://registry.npmjs.org/enhanced-resolve/-/enhanced-resolve-5.18.4.tgz",
-      "integrity": "sha512-LgQMM4WXU3QI+SYgEc2liRgznaD5ojbmY3sb8LxyguVkIg5FxdpTkvk72te2R38/TGKxH634oLxXRGY6d7AP+Q==",
+      "version": "5.20.1",
+      "resolved": "https://registry.npmjs.org/enhanced-resolve/-/enhanced-resolve-5.20.1.tgz",
+      "integrity": "sha512-Qohcme7V1inbAfvjItgw0EaxVX5q2rdVEZHRBrEQdRZTssLDGsL8Lwrznl8oQ/6kuTJONLaDcGjkNP247XEhcA==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "graceful-fs": "^4.2.4",
-        "tapable": "^2.2.0"
+        "tapable": "^2.3.0"
       },
       "engines": {
         "node": ">=10.13.0"
@@ -17426,6 +18019,21 @@
         "url": "https://opencollective.com/parcel"
       }
     },
+    "node_modules/linkify-it": {
+      "version": "5.0.0",
+      "resolved": "https://registry.npmjs.org/linkify-it/-/linkify-it-5.0.0.tgz",
+      "integrity": "sha512-5aHCbzQRADcdP+ATqnDuhhJ/MRIqDkZX5pyjFHRRysS8vZ5AbqGEoFIb6pYHPZ+L/OC2Lc+xT8uHVVR5CAK/wQ==",
+      "license": "MIT",
+      "dependencies": {
+        "uc.micro": "^2.0.0"
+      }
+    },
+    "node_modules/linkifyjs": {
+      "version": "4.3.2",
+      "resolved": "https://registry.npmjs.org/linkifyjs/-/linkifyjs-4.3.2.tgz",
+      "integrity": "sha512-NT1CJtq3hHIreOianA8aSXn6Cw0JzYOuDQbOrSPe7gqFnCpKP++MQe3ODgO3oh2GJFORkAAdqredOa60z63GbA==",
+      "license": "MIT"
+    },
     "node_modules/localforage": {
       "version": "1.10.0",
       "resolved": "https://registry.npmjs.org/localforage/-/localforage-1.10.0.tgz",
@@ -17601,6 +18209,41 @@
         "node": ">=10"
       }
     },
+    "node_modules/markdown-it": {
+      "version": "14.1.1",
+      "resolved": "https://registry.npmjs.org/markdown-it/-/markdown-it-14.1.1.tgz",
+      "integrity": "sha512-BuU2qnTti9YKgK5N+IeMubp14ZUKUUw7yeJbkjtosvHiP0AZ5c8IAgEMk79D0eC8F23r4Ac/q8cAIFdm2FtyoA==",
+      "license": "MIT",
+      "dependencies": {
+        "argparse": "^2.0.1",
+        "entities": "^4.4.0",
+        "linkify-it": "^5.0.0",
+        "mdurl": "^2.0.0",
+        "punycode.js": "^2.3.1",
+        "uc.micro": "^2.1.0"
+      },
+      "bin": {
+        "markdown-it": "bin/markdown-it.mjs"
+      }
+    },
+    "node_modules/markdown-it-task-lists": {
+      "version": "2.1.1",
+      "resolved": "https://registry.npmjs.org/markdown-it-task-lists/-/markdown-it-task-lists-2.1.1.tgz",
+      "integrity": "sha512-TxFAc76Jnhb2OUu+n3yz9RMu4CwGfaT788br6HhEDlvWfdeJcLUsxk1Hgw2yJio0OXsxv7pyIPmvECY7bMbluA==",
+      "license": "ISC"
+    },
+    "node_modules/markdown-it/node_modules/entities": {
+      "version": "4.5.0",
+      "resolved": "https://registry.npmjs.org/entities/-/entities-4.5.0.tgz",
+      "integrity": "sha512-V0hjH4dGPh9Ao5p0MoRY6BVqtwCjhz6vI5LT8AJ55H+4g9/4vbHx1I54fS0XuclLhDHArPQCiMjDxjaL8fPxhw==",
+      "license": "BSD-2-Clause",
+      "engines": {
+        "node": ">=0.12"
+      },
+      "funding": {
+        "url": "https://github.com/fb55/entities?sponsor=1"
+      }
+    },
     "node_modules/markdown-table": {
       "version": "3.0.4",
       "resolved": "https://registry.npmjs.org/markdown-table/-/markdown-table-3.0.4.tgz",
@@ -17909,6 +18552,12 @@
       "dev": true,
       "license": "CC0-1.0"
     },
+    "node_modules/mdurl": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/mdurl/-/mdurl-2.0.0.tgz",
+      "integrity": "sha512-Lf+9+2r+Tdp5wXDXC4PcIBjTDtq4UKjCPMQhKIuzpJNW0b96kVqSwW0bT7FhRSfmAiFYgP+SCRvdrDozfh0U5w==",
+      "license": "MIT"
+    },
     "node_modules/media-chrome": {
       "version": "4.17.2",
       "resolved": "https://registry.npmjs.org/media-chrome/-/media-chrome-4.17.2.tgz",
@@ -18966,6 +19615,12 @@
         "wrappy": "1"
       }
     },
+    "node_modules/orderedmap": {
+      "version": "2.1.1",
+      "resolved": "https://registry.npmjs.org/orderedmap/-/orderedmap-2.1.1.tgz",
+      "integrity": "sha512-TvAWxi0nDe1j/rtMcWcIj94+Ffe6n7zhow33h40SKxmsmozs6dz/e+EajymfoFcHd7sxNn8yHM8839uixMOV6g==",
+      "license": "MIT"
+    },
     "node_modules/p-limit": {
       "version": "3.1.0",
       "resolved": "https://registry.npmjs.org/p-limit/-/p-limit-3.1.0.tgz",
@@ -19497,6 +20152,216 @@
         "url": "https://github.com/sponsors/wooorm"
       }
     },
+    "node_modules/prosemirror-changeset": {
+      "version": "2.4.0",
+      "resolved": "https://registry.npmjs.org/prosemirror-changeset/-/prosemirror-changeset-2.4.0.tgz",
+      "integrity": "sha512-LvqH2v7Q2SF6yxatuPP2e8vSUKS/L+xAU7dPDC4RMyHMhZoGDfBC74mYuyYF4gLqOEG758wajtyhNnsTkuhvng==",
+      "license": "MIT",
+      "dependencies": {
+        "prosemirror-transform": "^1.0.0"
+      }
+    },
+    "node_modules/prosemirror-collab": {
+      "version": "1.3.1",
+      "resolved": "https://registry.npmjs.org/prosemirror-collab/-/prosemirror-collab-1.3.1.tgz",
+      "integrity": "sha512-4SnynYR9TTYaQVXd/ieUvsVV4PDMBzrq2xPUWutHivDuOshZXqQ5rGbZM84HEaXKbLdItse7weMGOUdDVcLKEQ==",
+      "license": "MIT",
+      "dependencies": {
+        "prosemirror-state": "^1.0.0"
+      }
+    },
+    "node_modules/prosemirror-commands": {
+      "version": "1.7.1",
+      "resolved": "https://registry.npmjs.org/prosemirror-commands/-/prosemirror-commands-1.7.1.tgz",
+      "integrity": "sha512-rT7qZnQtx5c0/y/KlYaGvtG411S97UaL6gdp6RIZ23DLHanMYLyfGBV5DtSnZdthQql7W+lEVbpSfwtO8T+L2w==",
+      "license": "MIT",
+      "dependencies": {
+        "prosemirror-model": "^1.0.0",
+        "prosemirror-state": "^1.0.0",
+        "prosemirror-transform": "^1.10.2"
+      }
+    },
+    "node_modules/prosemirror-dropcursor": {
+      "version": "1.8.2",
+      "resolved": "https://registry.npmjs.org/prosemirror-dropcursor/-/prosemirror-dropcursor-1.8.2.tgz",
+      "integrity": "sha512-CCk6Gyx9+Tt2sbYk5NK0nB1ukHi2ryaRgadV/LvyNuO3ena1payM2z6Cg0vO1ebK8cxbzo41ku2DE5Axj1Zuiw==",
+      "license": "MIT",
+      "dependencies": {
+        "prosemirror-state": "^1.0.0",
+        "prosemirror-transform": "^1.1.0",
+        "prosemirror-view": "^1.1.0"
+      }
+    },
+    "node_modules/prosemirror-gapcursor": {
+      "version": "1.4.1",
+      "resolved": "https://registry.npmjs.org/prosemirror-gapcursor/-/prosemirror-gapcursor-1.4.1.tgz",
+      "integrity": "sha512-pMdYaEnjNMSwl11yjEGtgTmLkR08m/Vl+Jj443167p9eB3HVQKhYCc4gmHVDsLPODfZfjr/MmirsdyZziXbQKw==",
+      "license": "MIT",
+      "dependencies": {
+        "prosemirror-keymap": "^1.0.0",
+        "prosemirror-model": "^1.0.0",
+        "prosemirror-state": "^1.0.0",
+        "prosemirror-view": "^1.0.0"
+      }
+    },
+    "node_modules/prosemirror-history": {
+      "version": "1.5.0",
+      "resolved": "https://registry.npmjs.org/prosemirror-history/-/prosemirror-history-1.5.0.tgz",
+      "integrity": "sha512-zlzTiH01eKA55UAf1MEjtssJeHnGxO0j4K4Dpx+gnmX9n+SHNlDqI2oO1Kv1iPN5B1dm5fsljCfqKF9nFL6HRg==",
+      "license": "MIT",
+      "dependencies": {
+        "prosemirror-state": "^1.2.2",
+        "prosemirror-transform": "^1.0.0",
+        "prosemirror-view": "^1.31.0",
+        "rope-sequence": "^1.3.0"
+      }
+    },
+    "node_modules/prosemirror-inputrules": {
+      "version": "1.5.1",
+      "resolved": "https://registry.npmjs.org/prosemirror-inputrules/-/prosemirror-inputrules-1.5.1.tgz",
+      "integrity": "sha512-7wj4uMjKaXWAQ1CDgxNzNtR9AlsuwzHfdFH1ygEHA2KHF2DOEaXl1CJfNPAKCg9qNEh4rum975QLaCiQPyY6Fw==",
+      "license": "MIT",
+      "dependencies": {
+        "prosemirror-state": "^1.0.0",
+        "prosemirror-transform": "^1.0.0"
+      }
+    },
+    "node_modules/prosemirror-keymap": {
+      "version": "1.2.3",
+      "resolved": "https://registry.npmjs.org/prosemirror-keymap/-/prosemirror-keymap-1.2.3.tgz",
+      "integrity": "sha512-4HucRlpiLd1IPQQXNqeo81BGtkY8Ai5smHhKW9jjPKRc2wQIxksg7Hl1tTI2IfT2B/LgX6bfYvXxEpJl7aKYKw==",
+      "license": "MIT",
+      "dependencies": {
+        "prosemirror-state": "^1.0.0",
+        "w3c-keyname": "^2.2.0"
+      }
+    },
+    "node_modules/prosemirror-markdown": {
+      "version": "1.13.4",
+      "resolved": "https://registry.npmjs.org/prosemirror-markdown/-/prosemirror-markdown-1.13.4.tgz",
+      "integrity": "sha512-D98dm4cQ3Hs6EmjK500TdAOew4Z03EV71ajEFiWra3Upr7diytJsjF4mPV2dW+eK5uNectiRj0xFxYI9NLXDbw==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/markdown-it": "^14.0.0",
+        "markdown-it": "^14.0.0",
+        "prosemirror-model": "^1.25.0"
+      }
+    },
+    "node_modules/prosemirror-menu": {
+      "version": "1.3.0",
+      "resolved": "https://registry.npmjs.org/prosemirror-menu/-/prosemirror-menu-1.3.0.tgz",
+      "integrity": "sha512-TImyPXCHPcDsSka2/lwJ6WjTASr4re/qWq1yoTTuLOqfXucwF6VcRa2LWCkM/EyTD1UO3CUwiH8qURJoWJRxwg==",
+      "license": "MIT",
+      "dependencies": {
+        "crelt": "^1.0.0",
+        "prosemirror-commands": "^1.0.0",
+        "prosemirror-history": "^1.0.0",
+        "prosemirror-state": "^1.0.0"
+      }
+    },
+    "node_modules/prosemirror-model": {
+      "version": "1.25.4",
+      "resolved": "https://registry.npmjs.org/prosemirror-model/-/prosemirror-model-1.25.4.tgz",
+      "integrity": "sha512-PIM7E43PBxKce8OQeezAs9j4TP+5yDpZVbuurd1h5phUxEKIu+G2a+EUZzIC5nS1mJktDJWzbqS23n1tsAf5QA==",
+      "license": "MIT",
+      "peer": true,
+      "dependencies": {
+        "orderedmap": "^2.0.0"
+      }
+    },
+    "node_modules/prosemirror-schema-basic": {
+      "version": "1.2.4",
+      "resolved": "https://registry.npmjs.org/prosemirror-schema-basic/-/prosemirror-schema-basic-1.2.4.tgz",
+      "integrity": "sha512-ELxP4TlX3yr2v5rM7Sb70SqStq5NvI15c0j9j/gjsrO5vaw+fnnpovCLEGIcpeGfifkuqJwl4fon6b+KdrODYQ==",
+      "license": "MIT",
+      "dependencies": {
+        "prosemirror-model": "^1.25.0"
+      }
+    },
+    "node_modules/prosemirror-schema-list": {
+      "version": "1.5.1",
+      "resolved": "https://registry.npmjs.org/prosemirror-schema-list/-/prosemirror-schema-list-1.5.1.tgz",
+      "integrity": "sha512-927lFx/uwyQaGwJxLWCZRkjXG0p48KpMj6ueoYiu4JX05GGuGcgzAy62dfiV8eFZftgyBUvLx76RsMe20fJl+Q==",
+      "license": "MIT",
+      "dependencies": {
+        "prosemirror-model": "^1.0.0",
+        "prosemirror-state": "^1.0.0",
+        "prosemirror-transform": "^1.7.3"
+      }
+    },
+    "node_modules/prosemirror-state": {
+      "version": "1.4.4",
+      "resolved": "https://registry.npmjs.org/prosemirror-state/-/prosemirror-state-1.4.4.tgz",
+      "integrity": "sha512-6jiYHH2CIGbCfnxdHbXZ12gySFY/fz/ulZE333G6bPqIZ4F+TXo9ifiR86nAHpWnfoNjOb3o5ESi7J8Uz1jXHw==",
+      "license": "MIT",
+      "peer": true,
+      "dependencies": {
+        "prosemirror-model": "^1.0.0",
+        "prosemirror-transform": "^1.0.0",
+        "prosemirror-view": "^1.27.0"
+      }
+    },
+    "node_modules/prosemirror-tables": {
+      "version": "1.8.5",
+      "resolved": "https://registry.npmjs.org/prosemirror-tables/-/prosemirror-tables-1.8.5.tgz",
+      "integrity": "sha512-V/0cDCsHKHe/tfWkeCmthNUcEp1IVO3p6vwN8XtwE9PZQLAZJigbw3QoraAdfJPir4NKJtNvOB8oYGKRl+t0Dw==",
+      "license": "MIT",
+      "dependencies": {
+        "prosemirror-keymap": "^1.2.3",
+        "prosemirror-model": "^1.25.4",
+        "prosemirror-state": "^1.4.4",
+        "prosemirror-transform": "^1.10.5",
+        "prosemirror-view": "^1.41.4"
+      }
+    },
+    "node_modules/prosemirror-trailing-node": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/prosemirror-trailing-node/-/prosemirror-trailing-node-3.0.0.tgz",
+      "integrity": "sha512-xiun5/3q0w5eRnGYfNlW1uU9W6x5MoFKWwq/0TIRgt09lv7Hcser2QYV8t4muXbEr+Fwo0geYn79Xs4GKywrRQ==",
+      "license": "MIT",
+      "dependencies": {
+        "@remirror/core-constants": "3.0.0",
+        "escape-string-regexp": "^4.0.0"
+      },
+      "peerDependencies": {
+        "prosemirror-model": "^1.22.1",
+        "prosemirror-state": "^1.4.2",
+        "prosemirror-view": "^1.33.8"
+      }
+    },
+    "node_modules/prosemirror-trailing-node/node_modules/escape-string-regexp": {
+      "version": "4.0.0",
+      "resolved": "https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-4.0.0.tgz",
+      "integrity": "sha512-TtpcNJ3XAzx3Gq8sWRzJaVajRs0uVxA2YAkdb1jm2YkPz4G6egUFAyA3n5vtEIZefPk5Wa4UXbKuS5fKkJWdgA==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=10"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/prosemirror-transform": {
+      "version": "1.11.0",
+      "resolved": "https://registry.npmjs.org/prosemirror-transform/-/prosemirror-transform-1.11.0.tgz",
+      "integrity": "sha512-4I7Ce4KpygXb9bkiPS3hTEk4dSHorfRw8uI0pE8IhxlK2GXsqv5tIA7JUSxtSu7u8APVOTtbUBxTmnHIxVkIJw==",
+      "license": "MIT",
+      "dependencies": {
+        "prosemirror-model": "^1.21.0"
+      }
+    },
+    "node_modules/prosemirror-view": {
+      "version": "1.41.7",
+      "resolved": "https://registry.npmjs.org/prosemirror-view/-/prosemirror-view-1.41.7.tgz",
+      "integrity": "sha512-jUwKNCEIGiqdvhlS91/2QAg21e4dfU5bH2iwmSDQeosXJgKF7smG0YSplOWK0cjSNgIqXe7VXqo7EIfUFJdt3w==",
+      "license": "MIT",
+      "peer": true,
+      "dependencies": {
+        "prosemirror-model": "^1.20.0",
+        "prosemirror-state": "^1.0.0",
+        "prosemirror-transform": "^1.1.0"
+      }
+    },
     "node_modules/proto3-json-serializer": {
       "version": "2.0.2",
       "resolved": "https://registry.npmjs.org/proto3-json-serializer/-/proto3-json-serializer-2.0.2.tgz",
@@ -19569,6 +20434,15 @@
         "node": ">=6"
       }
     },
+    "node_modules/punycode.js": {
+      "version": "2.3.1",
+      "resolved": "https://registry.npmjs.org/punycode.js/-/punycode.js-2.3.1.tgz",
+      "integrity": "sha512-uxFIHU0YlHYhDQtV4R9J6a52SLx28BCjT+4ieh7IGbgwVJWO+km431c4yRlREUAsAmt/uMjQUyQHNEPf0M39CA==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=6"
+      }
+    },
     "node_modules/qs": {
       "version": "6.14.2",
       "resolved": "https://registry.npmjs.org/qs/-/qs-6.14.2.tgz",
@@ -20161,6 +21035,12 @@
         "fsevents": "~2.3.2"
       }
     },
+    "node_modules/rope-sequence": {
+      "version": "1.3.4",
+      "resolved": "https://registry.npmjs.org/rope-sequence/-/rope-sequence-1.3.4.tgz",
+      "integrity": "sha512-UT5EDe2cu2E/6O4igUr5PSFs23nvvukicWHx6GnOPlHAiiYbzNuCRQCuiUdHJQcqKalLKlrYJnjY0ySGsXNQXQ==",
+      "license": "MIT"
+    },
     "node_modules/roughjs": {
       "version": "4.6.6",
       "resolved": "https://registry.npmjs.org/roughjs/-/roughjs-4.6.6.tgz",
@@ -21001,6 +21881,55 @@
         "url": "https://github.com/sponsors/SuperchupuDev"
       }
     },
+    "node_modules/tippy.js": {
+      "version": "6.3.7",
+      "resolved": "https://registry.npmjs.org/tippy.js/-/tippy.js-6.3.7.tgz",
+      "integrity": "sha512-E1d3oP2emgJ9dRQZdf3Kkn0qJgI6ZLpyS5z6ZkY1DF3kaQaBsGZsndEpHwx+eC+tYM41HaSNvNtLx8tU57FzTQ==",
+      "license": "MIT",
+      "dependencies": {
+        "@popperjs/core": "^2.9.0"
+      }
+    },
+    "node_modules/tiptap-markdown": {
+      "version": "0.9.0",
+      "resolved": "https://registry.npmjs.org/tiptap-markdown/-/tiptap-markdown-0.9.0.tgz",
+      "integrity": "sha512-dKLQ9iiuGNgrlGVjrNauF/UBzWu4LYOx5pkD0jNkmQt/GOwfCJsBuzZTsf1jZ204ANHOm572mZ9PYvGh1S7tpQ==",
+      "license": "MIT",
+      "workspaces": [
+        "example"
+      ],
+      "dependencies": {
+        "@types/markdown-it": "^13.0.7",
+        "markdown-it": "^14.1.0",
+        "markdown-it-task-lists": "^2.1.1",
+        "prosemirror-markdown": "^1.11.1"
+      },
+      "peerDependencies": {
+        "@tiptap/core": "^3.0.1"
+      }
+    },
+    "node_modules/tiptap-markdown/node_modules/@types/linkify-it": {
+      "version": "3.0.5",
+      "resolved": "https://registry.npmjs.org/@types/linkify-it/-/linkify-it-3.0.5.tgz",
+      "integrity": "sha512-yg6E+u0/+Zjva+buc3EIb+29XEg4wltq7cSmd4Uc2EE/1nUVmxyzpX6gUXD0V8jIrG0r7YeOGVIbYRkxeooCtw==",
+      "license": "MIT"
+    },
+    "node_modules/tiptap-markdown/node_modules/@types/markdown-it": {
+      "version": "13.0.9",
+      "resolved": "https://registry.npmjs.org/@types/markdown-it/-/markdown-it-13.0.9.tgz",
+      "integrity": "sha512-1XPwR0+MgXLWfTn9gCsZ55AHOKW1WN+P9vr0PaQh5aerR9LLQXUbjfEAFhjmEmyoYFWAyuN2Mqkn40MZ4ukjBw==",
+      "license": "MIT",
+      "dependencies": {
+        "@types/linkify-it": "^3",
+        "@types/mdurl": "^1"
+      }
+    },
+    "node_modules/tiptap-markdown/node_modules/@types/mdurl": {
+      "version": "1.0.5",
+      "resolved": "https://registry.npmjs.org/@types/mdurl/-/mdurl-1.0.5.tgz",
+      "integrity": "sha512-6L6VymKTzYSrEf4Nev4Xa1LCHKrlTlYCBMTlQKFuddo1CvQcE52I0mwfOJayueUC7MJuXOeHTcIU683lzd0cUA==",
+      "license": "MIT"
+    },
     "node_modules/tldts": {
       "version": "7.0.23",
       "resolved": "https://registry.npmjs.org/tldts/-/tldts-7.0.23.tgz",
@@ -21276,6 +22205,12 @@
         "node": "*"
       }
     },
+    "node_modules/uc.micro": {
+      "version": "2.1.0",
+      "resolved": "https://registry.npmjs.org/uc.micro/-/uc.micro-2.1.0.tgz",
+      "integrity": "sha512-ARDJmphmdvUk6Glw7y9DQ2bFkKBHwQHLi2lsaH6PPmz/Ka9sFOBsBluozhDltWmnv9u/cF6Rt87znRTPV+yp/A==",
+      "license": "MIT"
+    },
     "node_modules/ufo": {
       "version": "1.6.3",
       "resolved": "https://registry.npmjs.org/ufo/-/ufo-1.6.3.tgz",
