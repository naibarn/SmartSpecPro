#!/usr/bin/env python3
"""Offline SHA-256 verification for extracted pack (not a digital signature)."""
from pathlib import Path
import hashlib,sys
R=Path(__file__).resolve().parent
entries=(R/'SHA256SUMS.txt').read_text().splitlines()
seen=set()
for entry in entries:
    if not entry.strip():continue
    digest,rel=entry.split('  ',1)
    if rel in seen:raise SystemExit('duplicate manifest path: '+rel)
    seen.add(rel)
    p=(R/rel).resolve()
    if not p.is_relative_to(R.resolve()) or not p.is_file() or p.is_symlink():raise SystemExit('unsafe/missing manifest file: '+rel)
    if hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise SystemExit('HASH MISMATCH '+rel)
print('PASS: SHA256 manifest verified for',len(seen),'files')
