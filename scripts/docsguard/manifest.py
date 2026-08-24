"""Canonical SHA-256 manifest generation and parsing for docs/ integrity.

Contract (see openspec/changes/docs-integrity-markdown/design.md):

- UTF-8 bytes; line 1 is ``docs-integrity-manifest v1\\n``.
- One line per regular file: ``<lowercase-64-hex><ASCII space><relpath>\\n``.
- Relpaths are forward-slash, relative to the scanned root, sorted ascending
  by UTF-8 byte order. LF endings everywhere, including after the last entry.
  No timestamps or environment-derived values ever enter the bytes.
- Scanner covers dotfiles (regular files only), uses ``lstat``, and never
  follows symlinks; directories are traversed, everything else is skipped.
- Filenames containing LF or CR cannot be baselined safely and abort the
  scan as an operational error naming the offending path.
"""

from __future__ import annotations

import hashlib
import os
import stat

MANIFEST_HEADER = b"docs-integrity-manifest v1\n"

_HASH_LENGTH = 64
_CHUNK_SIZE = 1 << 20  # 1 MiB read chunks
_HEX_DIGITS = frozenset(b"0123456789abcdef")


class ManifestError(Exception):
    """Operational manifest failure; maps to exit code 3 upstream."""

    def __init__(self, message: str, *, path: str | None = None) -> None:
        super().__init__(message)
        self.path = path


def _hash_file(path: str) -> str:
    """Return the lowercase hex SHA-256 digest of the file at ``path``."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(_CHUNK_SIZE):
            digest.update(chunk)
    return digest.hexdigest()


def _relpath(path: str, root: str) -> str:
    """Forward-slash relpath of ``path`` relative to ``root``."""
    return os.path.relpath(path, root).replace(os.sep, "/")


def _iter_regular_files(root: str):
    """Yield absolute paths of regular files under ``root``.

    Iterative scandir walk using ``lstat`` so symlinks are classified by
    their own mode and never followed, matching the design contract.
    """
    pending = [root]
    while pending:
        current = pending.pop()
        with os.scandir(current) as entries:
            for entry in sorted(entries, key=lambda item: item.name):
                entry_mode = os.lstat(entry.path).st_mode
                if stat.S_ISLNK(entry_mode):
                    continue  # never follow links in either role
                if stat.S_ISDIR(entry_mode):
                    pending.append(entry.path)
                elif stat.S_ISREG(entry_mode):
                    yield entry.path


def scan_entries(root) -> list[tuple[str, str]]:
    """Scan ``root`` and return sorted ``(relpath, sha256hex)`` pairs.

    Raises :class:`ManifestError` when a filename cannot be represented in
    canonical manifest bytes (LF or CR in any path component).
    """
    root = os.path.abspath(root)
    entries: list[tuple[str, str]] = []
    for path in _iter_regular_files(root):
        relpath = _relpath(path, root)
        if "\n" in relpath:
            raise ManifestError(
                f"filename contains LF and cannot be baselined: {relpath}",
                path=relpath,
            )
        if "\r" in relpath:
            raise ManifestError(
                f"filename contains CR and cannot be baselined: {relpath}",
                path=relpath,
            )
        entries.append((relpath, _hash_file(path)))
    entries.sort(key=lambda item: item[0].encode("utf-8"))
    return entries


def serialize_entries(entries) -> bytes:
    """Serialize ``(relpath, hash)`` pairs into canonical manifest bytes."""
    lines = [MANIFEST_HEADER]
    for relpath, digest in sorted(entries, key=lambda item: item[0].encode("utf-8")):
        encoded_digest = digest.encode("ascii")
        if len(encoded_digest) != _HASH_LENGTH or set(encoded_digest) - _HEX_DIGITS:
            raise ValueError(f"non-canonical digest for {relpath!r}: {digest!r}")
        lines.append(encoded_digest + b" " + relpath.encode("utf-8") + b"\n")
    return b"".join(lines)


def generate_manifest(root) -> bytes:
    """Scan ``root`` and return its canonical serialized manifest bytes."""
    return serialize_entries(scan_entries(root))


def parse_manifest(data: bytes) -> list[tuple[str, str]]:
    """Parse canonical manifest bytes back into ordered entries.

    Strict by design: unknown headers, missing trailing LF, malformed
    lines, non-lowercase/non-64-hex digests, duplicate paths, or undecodable
    UTF-8 paths all raise :class:`ManifestError` (an operational error,
    never tampering evidence).
    """
    if not data.startswith(MANIFEST_HEADER):
        raise ManifestError(
            "manifest does not start with expected v1 header "
            f"{MANIFEST_HEADER!r}"
        )
    body = data[len(MANIFEST_HEADER):]
    if not body:
        return []
    if not body.endswith(b"\n"):
        raise ManifestError("manifest body lacks final LF line ending")

    entries: list[tuple[str, str]] = []
    seen: set[str] = set()
    for raw_line in body.split(b"\n")[:-1]:
        parts = raw_line.split(b" ", 1)
        if len(parts) != 2:
            raise ManifestError(f"malformed manifest line: {raw_line!r}")
        raw_digest, raw_path = parts
        if len(raw_digest) != _HASH_LENGTH or set(raw_digest) - _HEX_DIGITS:
            raise ManifestError(
                f"non-canonical digest in manifest line: {raw_line!r}"
            )
        try:
            relpath = raw_path.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ManifestError(
                f"manifest line is not valid UTF-8: {raw_line!r}"
            ) from exc
        if not relpath:
            raise ManifestError("manifest line has empty relpath")
        if relpath in seen:
            raise ManifestError(f"duplicate manifest entry for {relpath!r}")
        seen.add(relpath)
        entries.append((relpath, raw_digest.decode("ascii")))
    return entries
