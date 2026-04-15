use smartspec_shell_lib::local_file_index::{build_managed_root, WritebackMode};
use smartspec_shell_lib::local_file_service::{
    describe_local_file_parser_capabilities, get_metadata_internal, get_preview_internal,
    get_snippets_internal, list_related_files_internal, remove_root_and_purge_internal,
    search_files_internal, stage_into_workspace_internal, RemoveRootRequest, SearchFilesRequest,
    StageIntoWorkspaceRequest,
};
use std::fs;
#[cfg(target_os = "linux")]
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static ENV_LOCK: Mutex<()> = Mutex::new(());

fn temp_dir(name: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    path.push(format!("smartspec-local-file-service-{name}-{suffix}"));
    path
}

fn create_docx_fixture(path: &PathBuf, text: &str) {
    let script = format!(
        "import zipfile\npath = r'''{path}'''\ntext = r'''{text}'''\nwith zipfile.ZipFile(path, 'w') as archive:\n    archive.writestr('[Content_Types].xml', '<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"></Types>')\n    archive.writestr('word/document.xml', f'<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>{{text}}</w:t></w:r></w:p></w:body></w:document>')",
        path = path.to_string_lossy(),
        text = text.replace('\'', "\\'")
    );
    let status = Command::new("python3")
        .arg("-c")
        .arg(script)
        .status()
        .unwrap();
    assert!(status.success());
}

fn create_xlsx_fixture(path: &PathBuf, text: &str) {
    let script = format!(
        "import zipfile\npath = r'''{path}'''\ntext = r'''{text}'''\nwith zipfile.ZipFile(path, 'w') as archive:\n    archive.writestr('[Content_Types].xml', '<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"></Types>')\n    archive.writestr('xl/sharedStrings.xml', f'<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><si><t>{{text}}</t></si></sst>')\n    archive.writestr('xl/worksheets/sheet1.xml', '<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData><row r=\"1\"><c t=\"s\"><v>0</v></c></row></sheetData></worksheet>')",
        path = path.to_string_lossy(),
        text = text.replace('\'', "\\'")
    );
    let status = Command::new("python3")
        .arg("-c")
        .arg(script)
        .status()
        .unwrap();
    assert!(status.success());
}

fn create_pptx_fixture(path: &PathBuf, text: &str) {
    let script = format!(
        "import zipfile\npath = r'''{path}'''\ntext = r'''{text}'''\nwith zipfile.ZipFile(path, 'w') as archive:\n    archive.writestr('[Content_Types].xml', '<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"></Types>')\n    archive.writestr('ppt/slides/slide1.xml', f'<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>{{text}}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>')",
        path = path.to_string_lossy(),
        text = text.replace('\'', "\\'")
    );
    let status = Command::new("python3")
        .arg("-c")
        .arg(script)
        .status()
        .unwrap();
    assert!(status.success());
}

fn create_openxml_macro_fixture(path: &PathBuf, kind: &str, text: &str) {
    let (xml_entry, xml_payload, extra_entries, macro_entry, media_entry) = match kind {
        "docm" => (
            "word/document.xml",
            format!(
                "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>"
            ),
            "[]".to_string(),
            "word/vbaProject.bin",
            "word/media/image1.png",
        ),
        "pptm" => (
            "ppt/slides/slide1.xml",
            format!(
                "<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>{text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>"
            ),
            "[]".to_string(),
            "ppt/vbaProject.bin",
            "ppt/media/image1.png",
        ),
        "xlsm" => (
            "xl/worksheets/sheet1.xml",
            "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData><row r=\"1\"><c><v>42</v></c></row></sheetData></worksheet>".to_string(),
            "[(\"xl/sharedStrings.xml\", '<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><si><t>Budget Macro Summary</t></si></sst>')]".to_string(),
            "xl/vbaProject.bin",
            "xl/media/image1.png",
        ),
        _ => panic!("unsupported macro fixture kind"),
    };
    let script = format!(
        "import zipfile\npath = r'''{path}'''\nxml_entry = r'''{xml_entry}'''\nxml_payload = r'''{xml_payload}'''\nextra_entries = {extra_entries}\nwith zipfile.ZipFile(path, 'w') as archive:\n    archive.writestr('[Content_Types].xml', '<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"></Types>')\n    archive.writestr(xml_entry, xml_payload)\n    for entry_name, entry_payload in extra_entries:\n        archive.writestr(entry_name, entry_payload)\n    archive.writestr('{macro_entry}', b'macro-bytes')\n    archive.writestr('{media_entry}', b'img')",
        path = path.to_string_lossy(),
        xml_entry = xml_entry,
        xml_payload = xml_payload.replace('\'', "\\'"),
        extra_entries = extra_entries,
        macro_entry = macro_entry,
        media_entry = media_entry,
    );
    let status = Command::new("python3")
        .arg("-c")
        .arg(script)
        .status()
        .unwrap();
    assert!(status.success());
}

fn write_png_fixture(path: &PathBuf) {
    let png_bytes: [u8; 69] = [
        0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, b'I', b'H',
        b'D', b'R', 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
        0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0b, b'I', b'D', b'A', b'T', 0x08,
        0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d,
        0xb1, 0x00, 0x00, 0x00, 0x00, b'I', b'E', b'N', b'D', 0xae, 0x42, 0x60, 0x82,
    ];
    fs::write(path, png_bytes).unwrap();
}

fn write_bmp_fixture(path: &PathBuf) {
    let bmp_bytes: [u8; 56] = [
        0x42, 0x4d, 58, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0, 1, 0, 0, 0, 1, 0,
        0, 0, 1, 0, 24, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 255, 255, 255, 0,
    ];
    fs::write(path, bmp_bytes).unwrap();
}

#[cfg(target_os = "linux")]
fn write_fake_binary(path: &PathBuf, body: &str) {
    fs::write(path, body).unwrap();
    let mut permissions = fs::metadata(path).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).unwrap();
}

#[test]
fn searches_only_inside_approved_roots() {
    let _guard = ENV_LOCK.lock().unwrap();
    let root_dir = temp_dir("search");
    fs::create_dir_all(&root_dir).unwrap();
    let allowed_file = root_dir.join("quote.txt");
    fs::write(&allowed_file, "enterprise quote package").unwrap();
    let denied_root = build_managed_root("etc", "etc", "/etc", None, false).unwrap();
    let allowed_root = build_managed_root(
        "quotes",
        "Quotes",
        &root_dir.to_string_lossy(),
        Some(WritebackMode::ManagedOutputOnly),
        false,
    )
    .unwrap();

    let results = search_files_internal(SearchFilesRequest {
        roots: vec![denied_root, allowed_root],
        query: "quote".into(),
        max_results: Some(10),
    })
    .unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].absolute_path, allowed_file.to_string_lossy().to_string());
}

#[test]
fn stages_files_and_reads_preview_and_snippets() {
    let _guard = ENV_LOCK.lock().unwrap();
    let root_dir = temp_dir("stage");
    let workspace_dir = temp_dir("workspace");
    fs::create_dir_all(&root_dir).unwrap();
    let source_path = root_dir.join("notes.txt");
    fs::write(&source_path, "alpha\nbeta quote\ngamma").unwrap();
    let root = build_managed_root(
        "notes",
        "Notes",
        &root_dir.to_string_lossy(),
        Some(WritebackMode::ManagedOutputOnly),
        false,
    )
    .unwrap();

    let metadata = get_metadata_internal(vec![root.clone()], &source_path.to_string_lossy()).unwrap();
    let preview = get_preview_internal(vec![root.clone()], &source_path.to_string_lossy()).unwrap();
    let snippets =
        get_snippets_internal(vec![root.clone()], &source_path.to_string_lossy(), "quote").unwrap();
    let staged = stage_into_workspace_internal(StageIntoWorkspaceRequest {
        roots: vec![root],
        source_path: source_path.to_string_lossy().to_string(),
        workspace_dir: workspace_dir.to_string_lossy().to_string(),
    })
    .unwrap();

    assert_eq!(metadata.file_name, "notes.txt");
    assert!(preview.preview_text.contains("beta quote"));
    assert_eq!(snippets.len(), 1);
    assert!(PathBuf::from(staged.staged_path).exists());
}

#[test]
fn lists_related_files_and_purges_derived_stores_on_root_removal() {
    let _guard = ENV_LOCK.lock().unwrap();
    let root_dir = temp_dir("related");
    let derived_dir = temp_dir("derived");
    fs::create_dir_all(&root_dir).unwrap();
    fs::create_dir_all(derived_dir.join("quotes/previews")).unwrap();
    let primary = root_dir.join("quote.txt");
    let related = root_dir.join("quote.pdf");
    fs::write(&primary, "quote text").unwrap();
    fs::write(&related, "quote pdf").unwrap();
    let root = build_managed_root(
        "quotes",
        "Quotes",
        &root_dir.to_string_lossy(),
        Some(WritebackMode::ManagedOutputOnly),
        false,
    )
    .unwrap();

    let files = list_related_files_internal(vec![root], &primary.to_string_lossy()).unwrap();
    assert_eq!(files.len(), 1);
    assert!(files[0].file_name.ends_with(".pdf"));

    remove_root_and_purge_internal(RemoveRootRequest {
        root_id: "quotes".into(),
        derived_store_base_dir: derived_dir.to_string_lossy().to_string(),
    })
    .unwrap();
    assert!(!derived_dir.join("quotes").exists());
}

#[test]
fn uses_isolated_parser_for_pdf_office_and_image_documents() {
    let _guard = ENV_LOCK.lock().unwrap();
    let root_dir = temp_dir("rich-preview");
    fs::create_dir_all(&root_dir).unwrap();
    let pdf_path = root_dir.join("quote.pdf");
    let docx_path = root_dir.join("proposal.docx");
    let xlsx_path = root_dir.join("forecast.xlsx");
    let pptx_path = root_dir.join("deck.pptx");
    let png_path = root_dir.join("logo.png");
    let bmp_path = root_dir.join("thumbnail.bmp");
    fs::write(
        &pdf_path,
        b"%PDF-1.7\n1 0 obj\n<<>>\nstream\nBT (Enterprise Quote Alpha) Tj ET\nendstream\nendobj",
    )
    .unwrap();
    create_docx_fixture(&docx_path, "Quarterly Proposal Summary");
    create_xlsx_fixture(&xlsx_path, "Revenue Forecast");
    create_pptx_fixture(&pptx_path, "Launch Deck Outline");
    write_png_fixture(&png_path);
    write_bmp_fixture(&bmp_path);
    let root = build_managed_root(
        "quotes",
        "Quotes",
        &root_dir.to_string_lossy(),
        Some(WritebackMode::ManagedOutputOnly),
        false,
    )
    .unwrap();

    let pdf_preview = get_preview_internal(vec![root.clone()], &pdf_path.to_string_lossy()).unwrap();
    let docx_snippets =
        get_snippets_internal(vec![root.clone()], &docx_path.to_string_lossy(), "proposal")
            .unwrap();
    let xlsx_preview =
        get_preview_internal(vec![root.clone()], &xlsx_path.to_string_lossy()).unwrap();
    let pptx_preview =
        get_preview_internal(vec![root.clone()], &pptx_path.to_string_lossy()).unwrap();
    let image_preview = get_preview_internal(vec![root], &png_path.to_string_lossy()).unwrap();
    let bmp_preview = get_preview_internal(
        vec![build_managed_root(
            "quotes",
            "Quotes",
            &root_dir.to_string_lossy(),
            Some(WritebackMode::ManagedOutputOnly),
            false,
        )
        .unwrap()],
        &bmp_path.to_string_lossy(),
    )
    .unwrap();

    assert!(!pdf_preview.preview_text.trim().is_empty());
    assert_eq!(docx_snippets.len(), 1);
    assert!(docx_snippets[0].snippet.to_lowercase().contains("proposal"));
    assert!(xlsx_preview.preview_text.to_lowercase().contains("revenue forecast"));
    assert!(pptx_preview.preview_text.to_lowercase().contains("launch deck outline"));
    assert!(image_preview.preview_text.contains("PNG image"));
    assert!(image_preview.preview_text.contains("Width: 1"));
    assert!(bmp_preview.preview_text.contains("BMP image"));
}

#[test]
fn rejects_oversized_rich_document_parsing_requests() {
    let _guard = ENV_LOCK.lock().unwrap();
    let root_dir = temp_dir("oversized-rich-preview");
    fs::create_dir_all(&root_dir).unwrap();
    let huge_pdf_path = root_dir.join("huge.pdf");
    fs::write(&huge_pdf_path, vec![b'a'; 9_000_000]).unwrap();
    let root = build_managed_root(
        "quotes",
        "Quotes",
        &root_dir.to_string_lossy(),
        Some(WritebackMode::ManagedOutputOnly),
        false,
    )
    .unwrap();

    let preview = get_preview_internal(vec![root], &huge_pdf_path.to_string_lossy());

    assert!(preview.is_err());
}

#[test]
fn reports_bounded_local_file_parser_capabilities() {
    let _guard = ENV_LOCK.lock().unwrap();
    let capability = describe_local_file_parser_capabilities();

    assert!(capability.enabled);
    assert_eq!(capability.isolation_mode, "python_subprocess_bounded");
    assert!(capability.supported_formats.contains(&"pdf".to_string()));
    assert!(capability.supported_formats.contains(&"docx".to_string()));
    assert!(capability.supported_formats.contains(&"docm".to_string()));
    assert!(capability.supported_formats.contains(&"doc".to_string()));
    assert!(capability.supported_formats.contains(&"pptm".to_string()));
    assert!(capability.supported_formats.contains(&"xlsm".to_string()));
    assert!(capability.supported_formats.contains(&"bmp".to_string()));
    assert!(!capability.ocr_enabled);
    assert_eq!(capability.pdf_extractor, "internal_heuristic");
    assert_eq!(capability.ocr_provider, "none");
    assert_eq!(capability.render_backend, "none");
    assert_eq!(capability.office_renderer, "none");
    assert!(capability.rendered_preview_formats.is_empty());
    assert_eq!(capability.complex_document_support, "text_extraction_only");
    assert!(capability.macro_inspection_supported);
    assert!(capability.embedded_media_inspection_supported);
    assert_eq!(capability.layout_analysis_mode, "none");
    assert!(!capability.multi_page_rendering_supported);
    assert_eq!(capability.max_rendered_pages, 0);
    assert_eq!(capability.ocr_layout_mode, "plain_text");
    assert!(!capability.full_rendering_supported);
    assert!(!capability.active_content_execution_allowed);
}

#[test]
fn extracts_macro_and_embedded_media_summaries_from_macro_enabled_openxml_documents() {
    let _guard = ENV_LOCK.lock().unwrap();
    let root_dir = temp_dir("macro-openxml");
    fs::create_dir_all(&root_dir).unwrap();
    let docm_path = root_dir.join("brief.docm");
    let pptm_path = root_dir.join("deck.pptm");
    let xlsm_path = root_dir.join("budget.xlsm");
    create_openxml_macro_fixture(&docm_path, "docm", "Executive Brief");
    create_openxml_macro_fixture(&pptm_path, "pptm", "Launch Milestones");
    create_openxml_macro_fixture(&xlsm_path, "xlsm", "Budget Macro Summary");
    let root = build_managed_root(
        "quotes",
        "Quotes",
        &root_dir.to_string_lossy(),
        Some(WritebackMode::ManagedOutputOnly),
        false,
    )
    .unwrap();

    let docm_preview = get_preview_internal(vec![root.clone()], &docm_path.to_string_lossy()).unwrap();
    let pptm_preview = get_preview_internal(vec![root.clone()], &pptm_path.to_string_lossy()).unwrap();
    let xlsm_preview = get_preview_internal(vec![root], &xlsm_path.to_string_lossy()).unwrap();

    assert!(docm_preview.preview_text.contains("Macro inspection: macros detected"));
    assert!(docm_preview.preview_text.contains("Embedded media files: 1"));
    assert!(docm_preview.preview_text.contains("Executive Brief"));
    assert!(pptm_preview.preview_text.contains("Macro inspection: macros detected"));
    assert!(pptm_preview.preview_text.contains("Launch Milestones"));
    assert!(xlsm_preview.preview_text.contains("Macro inspection: macros detected"));
    assert!(xlsm_preview.preview_text.contains("Embedded media files: 1"));
    assert!(xlsm_preview.preview_text.contains("Worksheet count: 1"));
}

#[cfg(target_os = "linux")]
#[test]
fn enables_ocr_capability_when_tesseract_is_available() {
    let _guard = ENV_LOCK.lock().unwrap();
    let fake_bin_dir = temp_dir("ocr-bin");
    fs::create_dir_all(&fake_bin_dir).unwrap();
    write_fake_binary(
        &fake_bin_dir.join("tesseract"),
        "#!/usr/bin/env bash\necho 'Detected OCR text'\n",
    );

    let original_path = std::env::var("PATH").unwrap_or_default();
    std::env::set_var(
        "PATH",
        format!("{}:{}", fake_bin_dir.to_string_lossy(), original_path),
    );
    let capability = describe_local_file_parser_capabilities();
    std::env::set_var("PATH", original_path);

    assert!(capability.ocr_enabled);
    assert_eq!(capability.ocr_provider, "tesseract");
    assert_eq!(capability.ocr_layout_mode, "plain_text");
}

#[cfg(target_os = "linux")]
#[test]
fn reports_rendering_capabilities_when_pdf_and_office_renderers_are_available() {
    let _guard = ENV_LOCK.lock().unwrap();
    let fake_bin_dir = temp_dir("render-capability-bin");
    fs::create_dir_all(&fake_bin_dir).unwrap();
    write_fake_binary(
        &fake_bin_dir.join("pdftoppm"),
        "#!/usr/bin/env bash\nprefix=\"${@: -1}\"\ntouch \"${prefix}-1.png\"\ntouch \"${prefix}-2.png\"\n",
    );
    write_fake_binary(
        &fake_bin_dir.join("pdfinfo"),
        "#!/usr/bin/env bash\necho 'Pages:          2'\n",
    );
    write_fake_binary(
        &fake_bin_dir.join("tesseract"),
        "#!/usr/bin/env bash\necho \"Rendered OCR text $(basename \\\"$1\\\")\"\n",
    );
    write_fake_binary(
        &fake_bin_dir.join("soffice"),
        "#!/usr/bin/env bash\noutdir=\"\"\ninput=\"${@: -1}\"\nargs=(\"$@\")\nfor ((i=1; i<=$#; i++)); do\n  if [[ \"${args[$((i-1))]}\" == \"--outdir\" ]]; then\n    outdir=\"${args[$i]}\"\n    break\n  fi\ndone\nmkdir -p \"$outdir\"\nbase=\"$(basename \"$input\")\"\nbase=\"${base%.*}\"\ntouch \"$outdir/$base.pdf\"\n",
    );

    let original_path = std::env::var("PATH").unwrap_or_default();
    std::env::set_var(
        "PATH",
        format!("{}:{}", fake_bin_dir.to_string_lossy(), original_path),
    );
    let capability = describe_local_file_parser_capabilities();
    std::env::set_var("PATH", original_path);

    assert_eq!(capability.render_backend, "pdftoppm+soffice");
    assert_eq!(capability.office_renderer, "soffice");
    assert_eq!(capability.complex_document_support, "ocr_rendering");
    assert!(capability.multi_page_rendering_supported);
    assert_eq!(capability.max_rendered_pages, 3);
    assert_eq!(capability.ocr_layout_mode, "page_segmented");
    assert!(capability.rendered_preview_formats.contains(&"pdf".to_string()));
    assert!(capability.rendered_preview_formats.contains(&"doc".to_string()));
    assert!(capability.full_rendering_supported);
}

#[cfg(target_os = "linux")]
#[test]
fn uses_render_pipeline_for_scanned_pdf_and_legacy_office_documents() {
    let _guard = ENV_LOCK.lock().unwrap();
    let root_dir = temp_dir("render-pipeline");
    let fake_bin_dir = temp_dir("render-pipeline-bin");
    fs::create_dir_all(&root_dir).unwrap();
    fs::create_dir_all(&fake_bin_dir).unwrap();

    write_fake_binary(
        &fake_bin_dir.join("pdftotext"),
        "#!/usr/bin/env bash\nexit 1\n",
    );
    write_fake_binary(
        &fake_bin_dir.join("pdftoppm"),
        "#!/usr/bin/env bash\nprefix=\"${@: -1}\"\ntouch \"${prefix}-1.png\"\ntouch \"${prefix}-2.png\"\n",
    );
    write_fake_binary(
        &fake_bin_dir.join("pdfinfo"),
        "#!/usr/bin/env bash\necho 'Pages:          2'\n",
    );
    write_fake_binary(
        &fake_bin_dir.join("tesseract"),
        "#!/usr/bin/env bash\necho \"Rendered OCR text $(basename \\\"$1\\\")\"\n",
    );
    write_fake_binary(
        &fake_bin_dir.join("soffice"),
        "#!/usr/bin/env bash\noutdir=\"\"\ninput=\"${@: -1}\"\nargs=(\"$@\")\nfor ((i=1; i<=$#; i++)); do\n  if [[ \"${args[$((i-1))]}\" == \"--outdir\" ]]; then\n    outdir=\"${args[$i]}\"\n    break\n  fi\ndone\nmkdir -p \"$outdir\"\nbase=\"$(basename \"$input\")\"\nbase=\"${base%.*}\"\nprintf '%%PDF-1.7\\n' > \"$outdir/$base.pdf\"\n",
    );

    let pdf_path = root_dir.join("scan.pdf");
    let doc_path = root_dir.join("legacy.doc");
    fs::write(&pdf_path, b"%PDF-1.7\n").unwrap();
    fs::write(&doc_path, b"legacy-doc").unwrap();
    let root = build_managed_root(
        "quotes",
        "Quotes",
        &root_dir.to_string_lossy(),
        Some(WritebackMode::ManagedOutputOnly),
        false,
    )
    .unwrap();

    let original_path = std::env::var("PATH").unwrap_or_default();
    std::env::set_var(
        "PATH",
        format!("{}:{}", fake_bin_dir.to_string_lossy(), original_path),
    );
    let pdf_preview = get_preview_internal(vec![root.clone()], &pdf_path.to_string_lossy()).unwrap();
    let doc_preview = get_preview_internal(vec![root], &doc_path.to_string_lossy()).unwrap();
    std::env::set_var("PATH", original_path);

    assert!(pdf_preview.preview_text.contains("[Page 1]"));
    assert!(pdf_preview.preview_text.contains("rendered-page-1.png"));
    assert!(pdf_preview.preview_text.contains("[Page 2]"));
    assert!(doc_preview.preview_text.contains("[Page 1]"));
}

#[cfg(target_os = "linux")]
#[test]
fn uses_external_extractors_when_available() {
    let _guard = ENV_LOCK.lock().unwrap();
    let root_dir = temp_dir("external-extractors");
    let fake_bin_dir = temp_dir("external-bin");
    fs::create_dir_all(&root_dir).unwrap();
    fs::create_dir_all(&fake_bin_dir).unwrap();

    write_fake_binary(
        &fake_bin_dir.join("pdftotext"),
        "#!/usr/bin/env bash\necho 'pdftotext extracted text'\n",
    );
    write_fake_binary(
        &fake_bin_dir.join("tesseract"),
        "#!/usr/bin/env bash\necho 'OCR extracted text'\n",
    );

    let pdf_path = root_dir.join("quote.pdf");
    let png_path = root_dir.join("logo.png");
    fs::write(&pdf_path, b"%PDF-1.7\nignored").unwrap();
    write_png_fixture(&png_path);
    let root = build_managed_root(
        "quotes",
        "Quotes",
        &root_dir.to_string_lossy(),
        Some(WritebackMode::ManagedOutputOnly),
        false,
    )
    .unwrap();

    let original_path = std::env::var("PATH").unwrap_or_default();
    std::env::set_var(
        "PATH",
        format!("{}:{}", fake_bin_dir.to_string_lossy(), original_path),
    );
    let pdf_preview = get_preview_internal(vec![root.clone()], &pdf_path.to_string_lossy()).unwrap();
    let image_preview = get_preview_internal(vec![root], &png_path.to_string_lossy()).unwrap();
    let capability = describe_local_file_parser_capabilities();
    std::env::set_var("PATH", original_path);

    assert!(pdf_preview.preview_text.contains("pdftotext extracted text"));
    assert!(image_preview.preview_text.contains("OCR text:"));
    assert!(image_preview.preview_text.contains("OCR extracted text"));
    assert_eq!(capability.pdf_extractor, "pdftotext");
    assert_eq!(capability.ocr_provider, "tesseract");
}
