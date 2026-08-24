#!/usr/bin/env python3
"""Entry point for the docs integrity guard CLI.

Thin argv dispatcher only; all behavior lives in ``docsguard.cli``.
"""

from docsguard.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
