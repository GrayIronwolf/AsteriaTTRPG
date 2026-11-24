#!/usr/bin/env python3
"""Plan additive CORS repair without removing existing bucket rules."""
import argparse
import json
from pathlib import Path

def merge(existing, required):
    if not isinstance(existing, list) or not all(isinstance(rule, dict) for rule in existing):
        raise ValueError("Unexpected existing CORS format")
    if not isinstance(required, list) or len(required) != 1:
        raise ValueError("Expected one reviewed download rule")
    rule = required[0]
    if rule["origin"] != ["https://asteriattrpg.com"] or set(rule["method"]) != {"GET", "HEAD"}:
        raise ValueError("Unexpected origin or methods")
    return existing if rule in existing else [*existing, rule]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("current")
    parser.add_argument("required")
    parser.add_argument("output")
    args = parser.parse_args()
    current = json.loads(Path(args.current).read_text())
    required = json.loads(Path(args.required).read_text())
    if not isinstance(current, dict) or current.get("name") != "asteria-ttrpg.firebasestorage.app":
        raise ValueError("Unexpected bucket metadata")
    existing = current.get("cors", [])
    Path(args.output).write_text(json.dumps(merge(existing, required), indent=2) + "\n")

if __name__ == "__main__":
    main()
