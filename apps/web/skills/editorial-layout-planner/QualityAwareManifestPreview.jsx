export default function QualityAwareManifestPreview() {
  const manifest = require("./example.quality_render_manifest.json");
  const scale = 0.33;
  const canvas = manifest.canvas;
  const bgColor = canvas.background?.color || "#F4EEE7";

  const abs = (b) => ({
    left: b.x * scale,
    top: b.y * scale,
    width: b.w * scale,
    height: b.h * scale,
  });

  return (
    <div className="min-h-screen bg-stone-100 p-6 text-stone-800">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Quality-aware Manifest Preview</h1>
          <p className="mt-2 text-sm text-stone-600">
            ตัวอย่าง renderer preview ที่แสดง quality metrics, template switch, occupancy และ validation
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {manifest.pages.map((page) => (
            <div key={page.page_number} className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-stone-500">Page {page.page_number} · {page.page_role}</div>
                  <div className="text-lg font-semibold">{page.layout_pattern}</div>
                  {page.template_switched ? (
                    <div className="mt-1 text-xs text-amber-700">switched from {page.initial_layout_pattern}</div>
                  ) : null}
                </div>
                <div className="rounded-2xl bg-stone-50 px-3 py-2 text-xs">fitness {page.page_quality.fitness_score}</div>
              </div>

              <div className="flex flex-col gap-5 lg:flex-row">
                <div
                  className="relative overflow-hidden rounded-[28px] border border-stone-200 shadow-inner"
                  style={{ width: canvas.width_px * scale, height: canvas.height_px * scale, background: bgColor }}
                >
                  <div
                    className="absolute border border-dashed border-stone-400/70"
                    style={{
                      left: canvas.safe_area.x * scale,
                      top: canvas.safe_area.y * scale,
                      width: canvas.safe_area.w * scale,
                      height: canvas.safe_area.h * scale,
                    }}
                  />
                  {page.image_blocks.map((block) => (
                    <div
                      key={block.id}
                      className="absolute overflow-hidden border border-amber-300 bg-gradient-to-br from-amber-100 to-orange-100 text-amber-900 shadow-sm"
                      style={{ ...abs(block.bounds), borderRadius: (block.corner_radius_px || 0) * scale }}
                    >
                      <div className="flex h-full w-full items-center justify-center p-3 text-center text-[10px] leading-4">
                        <div>
                          <div className="font-semibold">{block.reference}</div>
                          <div className="opacity-70">{block.crop_mode} · {block.focal_point}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {page.text_blocks.map((block) => (
                    <div
                      key={block.id}
                      style={{
                        position: "absolute",
                        ...abs(block.bounds),
                        fontSize: block.typography.font_size_px * scale,
                        lineHeight: block.typography.line_height,
                        fontWeight: block.typography.weight,
                        textAlign: block.typography.align,
                        color: "#5A3D2E",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: block.typography.max_lines,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {block.content}
                    </div>
                  ))}
                </div>

                <div className="min-w-0 flex-1 space-y-4">
                  <div className="rounded-2xl bg-stone-50 p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Quality</div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">occupancy {page.page_quality.occupancy_ratio}</div>
                      <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">whitespace {page.page_quality.whitespace_ratio}</div>
                      <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">balance {page.page_quality.balance_score}</div>
                      <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">readability {page.page_quality.readability_score}</div>
                    </div>
                    {page.page_quality.switch_reason ? (
                      <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                        {page.page_quality.switch_reason}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl bg-stone-50 p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Validation</div>
                    <div className="space-y-2">
                      {page.page_validation.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
                          <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${item.status === "pass" ? "bg-emerald-500" : item.status === "warn" ? "bg-amber-500" : "bg-red-500"}`}></span>
                          <div>
                            <div className="text-sm font-medium">{item.check}</div>
                            <div className="text-sm text-stone-600">{item.message}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">{page.render_notes}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
