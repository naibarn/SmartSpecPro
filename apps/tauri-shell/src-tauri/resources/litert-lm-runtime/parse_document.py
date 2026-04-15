#!/usr/bin/env python3

import argparse
import json
import os
import re
import shutil
import struct
import subprocess
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree

MAX_ARCHIVE_ENTRIES = 256
MAX_ARCHIVE_MEMBER_BYTES = 8 * 1024 * 1024
MAX_ARCHIVE_TOTAL_BYTES = 32 * 1024 * 1024
MAX_OUTPUT_CHARS = 4000
DEFAULT_MAX_RENDERED_PAGES = 3


def _resolve_binary(env_var: str, binary_name: str) -> str | None:
    override = os.environ.get(env_var, "").strip()
    if override:
        return override
    return shutil.which(binary_name)


def _run_text_command(command: list[str], stdin_text: str | None = None) -> str:
    completed = subprocess.run(
        command,
        input=stdin_text,
        text=True,
        capture_output=True,
        timeout=8,
        check=False,
    )
    if completed.returncode != 0:
        stderr = (completed.stderr or "").strip()
        raise ValueError(stderr or f"command failed: {' '.join(command[:2])}")
    return completed.stdout.strip()


def _run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        text=True,
        capture_output=True,
        timeout=8,
        check=False,
    )


def _normalize_lines(text: str) -> list[str]:
    lines = [line.strip() for line in text.replace("\r", "\n").split("\n")]
    return [line for line in lines if line]


def _limit_text(text: str, max_chars: int) -> str:
    return text.strip()[:max_chars]


def _resolve_max_rendered_pages() -> int:
    raw = os.environ.get("SMARTSPEC_MAX_RENDERED_PAGES", "").strip()
    if not raw:
        return DEFAULT_MAX_RENDERED_PAGES
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_MAX_RENDERED_PAGES
    return max(1, min(value, 8))


def _extract_pdf_text(path: Path, max_chars: int) -> str:
    pdftotext_binary = _resolve_binary("SMARTSPEC_PDFTOTEXT_PATH", "pdftotext")
    if pdftotext_binary:
        try:
            extracted = _run_text_command([pdftotext_binary, str(path), "-"])
            if extracted.strip():
                return _limit_text(extracted, max_chars)
        except Exception:
            pass

    rendered_ocr = _extract_pdf_text_via_render_ocr(path, max_chars)
    if rendered_ocr:
        return rendered_ocr

    raw = path.read_bytes()
    candidate_chunks: list[str] = []

    for match in re.finditer(rb"\(([^()]{3,200})\)", raw):
        chunk = match.group(1).decode("latin-1", errors="ignore").strip()
        if chunk:
            candidate_chunks.append(chunk)

    if not candidate_chunks:
        decoded = raw.decode("latin-1", errors="ignore")
        candidate_chunks.extend(
            chunk.strip()
            for chunk in re.findall(r"[A-Za-z0-9][A-Za-z0-9 ,.;:/_()\-]{5,200}", decoded)
            if chunk.strip()
        )

    deduped: list[str] = []
    seen: set[str] = set()
    for chunk in candidate_chunks:
        if chunk not in seen:
            seen.add(chunk)
            deduped.append(chunk)

    return _limit_text("\n".join(deduped), max_chars)


def _resolve_pdf_page_count(path: Path) -> int:
    pdfinfo_binary = _resolve_binary("SMARTSPEC_PDFINFO_PATH", "pdfinfo")
    if not pdfinfo_binary:
        return 1
    try:
        output = _run_text_command([pdfinfo_binary, str(path)])
    except Exception:
        return 1
    match = re.search(r"^Pages:\s+(\d+)$", output, flags=re.MULTILINE)
    if not match:
        return 1
    return max(1, int(match.group(1)))


def _render_pdf_pages(path: Path, temp_dir: Path, max_pages: int) -> list[Path]:
    pdftoppm_binary = _resolve_binary("SMARTSPEC_PDFTOPPM_PATH", "pdftoppm")
    output_prefix = temp_dir / "rendered-page"
    if pdftoppm_binary:
        completed = _run_command(
            [
                pdftoppm_binary,
                "-f",
                "1",
                "-l",
                str(max_pages),
                "-png",
                str(path),
                str(output_prefix),
            ]
        )
        if completed.returncode == 0:
            rendered = sorted(temp_dir.glob("rendered-page-*.png"))
            if rendered:
                return rendered

    mutool_binary = _resolve_binary("SMARTSPEC_MUTOOL_PATH", "mutool")
    if mutool_binary:
        candidate_pattern = temp_dir / "rendered-page-%d.png"
        completed = _run_command(
            [
                mutool_binary,
                "draw",
                "-F",
                "png",
                "-o",
                str(candidate_pattern),
                str(path),
                f"1-{max_pages}",
            ]
        )
        if completed.returncode == 0:
            rendered = sorted(temp_dir.glob("rendered-page-*.png"))
            if rendered:
                return rendered
    return []


def _extract_pdf_text_via_render_ocr(path: Path, max_chars: int) -> str:
    tesseract_binary = _resolve_binary("SMARTSPEC_TESSERACT_PATH", "tesseract")
    if not tesseract_binary:
        return ""
    with tempfile.TemporaryDirectory(prefix="smartspec-pdf-render-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        page_count = _resolve_pdf_page_count(path)
        rendered_pages = _render_pdf_pages(
            path,
            temp_dir,
            min(page_count, _resolve_max_rendered_pages()),
        )
        if not rendered_pages:
            return ""
        page_chunks: list[str] = []
        for index, rendered_path in enumerate(rendered_pages, start=1):
            try:
                ocr_text = _run_text_command(
                    [tesseract_binary, str(rendered_path), "stdout", "--psm", "6"]
                )
            except Exception:
                continue
            if ocr_text.strip():
                page_chunks.append(f"[Page {index}]\n{ocr_text.strip()}")
        if page_chunks:
            return _limit_text("\n\n".join(page_chunks), max_chars)
    return ""


def _safe_zip_text(path: Path, prefixes: tuple[str, ...], max_chars: int) -> str:
    total_uncompressed = 0
    parts: list[str] = []
    macro_detected = False
    embedded_media_count = 0
    with zipfile.ZipFile(path, "r") as archive:
        infos = archive.infolist()
        if len(infos) > MAX_ARCHIVE_ENTRIES:
            raise ValueError("archive contains too many members")
        for info in infos:
            normalized_name = info.filename.lower()
            if normalized_name.endswith("vbaproject.bin"):
                macro_detected = True
            if "/media/" in normalized_name and not info.is_dir():
                embedded_media_count += 1
            if not info.filename.startswith(prefixes) or not info.filename.endswith(".xml"):
                continue
            if info.file_size > MAX_ARCHIVE_MEMBER_BYTES:
                raise ValueError("archive member exceeds size limit")
            total_uncompressed += info.file_size
            if total_uncompressed > MAX_ARCHIVE_TOTAL_BYTES:
                raise ValueError("archive expansion exceeds size limit")
            data = archive.read(info)
            root = ElementTree.fromstring(data)
            for value in root.itertext():
                text = value.strip()
                if text:
                    parts.append(text)
    summary_parts = [
        f"Macro inspection: {'macros detected' if macro_detected else 'no macros detected'}",
        f"Embedded media files: {embedded_media_count}",
    ]
    return _limit_text("\n".join(summary_parts + parts), max_chars)


def _extract_xlsx_text(path: Path, max_chars: int) -> str:
    total_uncompressed = 0
    shared_strings: list[str] = []
    values: list[str] = []
    macro_detected = False
    embedded_media_count = 0
    sheet_count = 0
    with zipfile.ZipFile(path, "r") as archive:
        infos = archive.infolist()
        if len(infos) > MAX_ARCHIVE_ENTRIES:
            raise ValueError("archive contains too many members")
        for info in infos:
            normalized_name = info.filename.lower()
            if normalized_name.endswith("vbaproject.bin"):
                macro_detected = True
            if "/media/" in normalized_name and not info.is_dir():
                embedded_media_count += 1
            if info.file_size > MAX_ARCHIVE_MEMBER_BYTES:
                raise ValueError("archive member exceeds size limit")
            total_uncompressed += info.file_size
            if total_uncompressed > MAX_ARCHIVE_TOTAL_BYTES:
                raise ValueError("archive expansion exceeds size limit")
            if info.filename == "xl/sharedStrings.xml":
                root = ElementTree.fromstring(archive.read(info))
                shared_strings.extend(text.strip() for text in root.itertext() if text.strip())
            elif info.filename.startswith("xl/worksheets/") and info.filename.endswith(".xml"):
                sheet_count += 1
                root = ElementTree.fromstring(archive.read(info))
                for element in root.iter():
                    if element.tag.endswith("}v") or element.tag == "v":
                        text = (element.text or "").strip()
                        if text:
                            values.append(text)

    expanded: list[str] = []
    for value in values:
        if value.isdigit():
            index = int(value)
            if 0 <= index < len(shared_strings):
                expanded.append(shared_strings[index])
            else:
                expanded.append(value)
        else:
            expanded.append(value)
    summary_parts = [
        f"Macro inspection: {'macros detected' if macro_detected else 'no macros detected'}",
        f"Embedded media files: {embedded_media_count}",
        f"Worksheet count: {sheet_count}",
    ]
    return _limit_text("\n".join(summary_parts + expanded), max_chars)


def _extract_bmp_metadata(raw: bytes) -> str:
    if len(raw) < 26 or raw[:2] != b"BM":
        raise ValueError("invalid bmp header")
    width = struct.unpack("<I", raw[18:22])[0]
    height = struct.unpack("<I", raw[22:26])[0]
    return f"BMP image\nWidth: {width}\nHeight: {height}"


def _extract_tiff_metadata(raw: bytes) -> str:
    if len(raw) < 8 or raw[:2] not in {b"II", b"MM"}:
        raise ValueError("invalid tiff header")
    endianness = "<" if raw[:2] == b"II" else ">"
    magic = struct.unpack(f"{endianness}H", raw[2:4])[0]
    if magic != 42:
        raise ValueError("invalid tiff header")
    return "TIFF image"


def _extract_svg_metadata(raw: bytes) -> str:
    try:
        root = ElementTree.fromstring(raw.decode("utf-8", errors="ignore"))
    except ElementTree.ParseError as exc:
        raise ValueError("invalid svg payload") from exc
    width = root.attrib.get("width", "unknown")
    height = root.attrib.get("height", "unknown")
    return f"SVG image\nWidth: {width}\nHeight: {height}"


def _extract_png_metadata(raw: bytes) -> str:
    if len(raw) < 24 or raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("invalid png header")
    width = struct.unpack(">I", raw[16:20])[0]
    height = struct.unpack(">I", raw[20:24])[0]
    return f"PNG image\nWidth: {width}\nHeight: {height}"


def _extract_gif_metadata(raw: bytes) -> str:
    if len(raw) < 10 or raw[:6] not in {b"GIF87a", b"GIF89a"}:
        raise ValueError("invalid gif header")
    width = struct.unpack("<H", raw[6:8])[0]
    height = struct.unpack("<H", raw[8:10])[0]
    return f"GIF image\nWidth: {width}\nHeight: {height}"


def _extract_webp_metadata(raw: bytes) -> str:
    if len(raw) < 30 or raw[:4] != b"RIFF" or raw[8:12] != b"WEBP":
        raise ValueError("invalid webp header")
    if raw[12:16] == b"VP8X":
        width = 1 + int.from_bytes(raw[24:27], "little")
        height = 1 + int.from_bytes(raw[27:30], "little")
        return f"WEBP image\nWidth: {width}\nHeight: {height}"
    raise ValueError("unsupported webp variant")


def _extract_jpeg_metadata(raw: bytes) -> str:
    if len(raw) < 4 or raw[:2] != b"\xff\xd8":
        raise ValueError("invalid jpeg header")
    offset = 2
    while offset + 9 < len(raw):
        if raw[offset] != 0xFF:
            offset += 1
            continue
        marker = raw[offset + 1]
        if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
            height = struct.unpack(">H", raw[offset + 5:offset + 7])[0]
            width = struct.unpack(">H", raw[offset + 7:offset + 9])[0]
            return f"JPEG image\nWidth: {width}\nHeight: {height}"
        if marker in {0xD8, 0xD9}:
            offset += 2
            continue
        segment_length = struct.unpack(">H", raw[offset + 2:offset + 4])[0]
        if segment_length < 2:
            break
        offset += 2 + segment_length
    raise ValueError("jpeg dimensions unavailable")


def _extract_image_text(path: Path, max_chars: int) -> str:
    raw = path.read_bytes()
    extension = path.suffix.lower().lstrip(".")
    if extension == "png":
        text = _extract_png_metadata(raw)
    elif extension in {"jpg", "jpeg"}:
        text = _extract_jpeg_metadata(raw)
    elif extension == "gif":
        text = _extract_gif_metadata(raw)
    elif extension == "webp":
        text = _extract_webp_metadata(raw)
    elif extension == "bmp":
        text = _extract_bmp_metadata(raw)
    elif extension in {"tif", "tiff"}:
        text = _extract_tiff_metadata(raw)
    elif extension == "svg":
        text = _extract_svg_metadata(raw)
    else:
        raise ValueError("unsupported image format")

    tesseract_binary = _resolve_binary("SMARTSPEC_TESSERACT_PATH", "tesseract")
    if tesseract_binary:
        try:
            ocr_text = _run_text_command(
                [tesseract_binary, str(path), "stdout", "--psm", "6"],
            )
            if ocr_text.strip():
                text = f"{text}\nOCR text:\n{ocr_text.strip()}"
        except Exception:
            pass
    return _limit_text(text, max_chars)


def _extract_office_text_via_renderer(path: Path, max_chars: int) -> str:
    soffice_binary = _resolve_binary("SMARTSPEC_SOFFICE_PATH", "soffice") or _resolve_binary(
        "SMARTSPEC_LIBREOFFICE_PATH", "libreoffice"
    )
    if not soffice_binary:
        return ""

    with tempfile.TemporaryDirectory(prefix="smartspec-office-render-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        completed = _run_command(
            [
                soffice_binary,
                "--headless",
                "--nologo",
                "--nolockcheck",
                "--nodefault",
                "--convert-to",
                "pdf",
                "--outdir",
                str(temp_dir),
                str(path),
            ]
        )
        if completed.returncode != 0:
            return ""
        converted_pdf = temp_dir / f"{path.stem}.pdf"
        if not converted_pdf.is_file():
            candidates = sorted(temp_dir.glob("*.pdf"))
            if not candidates:
                return ""
            converted_pdf = candidates[0]
        return _extract_pdf_text(converted_pdf, max_chars)


def _prefer_rendered_office_fallback(text: str, max_chars: int) -> bool:
    if not text.strip():
        return True
    return len(text.strip()) < min(max_chars, 48)


def _extract_document_text(path: Path, max_chars: int) -> str:
    extension = path.suffix.lower().lstrip(".")
    if extension == "pdf":
        return _extract_pdf_text(path, max_chars)
    if extension in {"docx", "docm"}:
        text = _safe_zip_text(path, ("word/",), max_chars)
        if _prefer_rendered_office_fallback(text, max_chars):
            rendered = _extract_office_text_via_renderer(path, max_chars)
            if rendered.strip():
                return rendered
        return text
    if extension in {"doc", "odt"}:
        rendered = _extract_office_text_via_renderer(path, max_chars)
        if rendered.strip():
            return rendered
        raise ValueError("office renderer unavailable for this document type")
    if extension in {"pptx", "pptm"}:
        text = _safe_zip_text(path, ("ppt/slides/",), max_chars)
        if _prefer_rendered_office_fallback(text, max_chars):
            rendered = _extract_office_text_via_renderer(path, max_chars)
            if rendered.strip():
                return rendered
        return text
    if extension in {"ppt", "odp"}:
        rendered = _extract_office_text_via_renderer(path, max_chars)
        if rendered.strip():
            return rendered
        raise ValueError("office renderer unavailable for this document type")
    if extension in {"xlsx", "xlsm"}:
        text = _extract_xlsx_text(path, max_chars)
        if _prefer_rendered_office_fallback(text, max_chars):
            rendered = _extract_office_text_via_renderer(path, max_chars)
            if rendered.strip():
                return rendered
        return text
    if extension in {"xls", "ods"}:
        rendered = _extract_office_text_via_renderer(path, max_chars)
        if rendered.strip():
            return rendered
        raise ValueError("office renderer unavailable for this document type")
    if extension in {"png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "svg"}:
        return _extract_image_text(path, max_chars)
    raise ValueError("unsupported managed document type")


def _build_snippets(text: str, query: str) -> list[dict]:
    query_lower = query.strip().lower()
    if not query_lower:
        return []
    snippets: list[dict] = []
    for index, line in enumerate(_normalize_lines(text), start=1):
        if query_lower in line.lower():
            snippets.append({"line_number": index, "snippet": line[:400]})
        if len(snippets) >= 10:
            break
    return snippets


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file-path", required=True)
    parser.add_argument("--mode", choices=("preview", "snippets"), required=True)
    parser.add_argument("--query", default="")
    parser.add_argument("--max-chars", type=int, default=MAX_OUTPUT_CHARS)
    args = parser.parse_args()

    try:
        path = Path(args.file_path).expanduser().resolve()
        if not path.is_file():
            raise ValueError("file path must point to a file")
        text = _extract_document_text(path, max(args.max_chars, 1))
        payload = {
            "preview_text": text if args.mode == "preview" else None,
            "snippets": _build_snippets(text, args.query) if args.mode == "snippets" else None,
            "error": None,
        }
        print(json.dumps(payload))
        return 0
    except Exception as exc:
        print(json.dumps({"preview_text": None, "snippets": None, "error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
