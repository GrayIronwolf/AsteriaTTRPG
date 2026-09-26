"""Compatibility command for existing desktop workflows."""
from pathlib import Path
import subprocess
subprocess.run(["node", str(Path(__file__).with_name("generate-compendium.js"))], check=True)
