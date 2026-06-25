"""Re-extract logo assets from map PDF — delegates to make_logo_assets.py."""
import os
import runpy

BASE = os.path.dirname(os.path.abspath(__file__))
runpy.run_path(os.path.join(BASE, "make_logo_assets.py"), run_name="__main__")
