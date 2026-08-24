#!/usr/bin/env python3
"""Entry point for the docs integrity guard CLI.

Thin argv dispatcher only. Subcommand wiring (check / update / convert-pdf)
lands in ``docsguard.cli`` in a later phase; until then every invocation is
an operational usage error mapped to exit code 3.
"""

import sys

USAGE = "usage: docs_guard.py {check|update|convert-pdf} [--project NAME] ...\n"


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else list(argv)
    del args  # dispatch table arrives with docsguard.cli
    sys.stderr.write(USAGE)
    return 3


if __name__ == "__main__":
    raise SystemExit(main())
