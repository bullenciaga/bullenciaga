"""Export the hosted studio as one offline HTML file. Supply an output path."""
import base64
import json
import mimetypes
import re
import sys
from pathlib import Path

site = Path(__file__).resolve().parents[1] / "site"
art = site / "assets/herd-studio"
html = (site / "herd-studio.html").read_text()


def data_uri(path):
    mime = {".woff2": "font/woff2", ".webp": "image/webp"}.get(path.suffix) or mimetypes.guess_type(path)[0]
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def inline_style(match):
    css = (site / match[1]).read_text()
    css = re.sub(r"url\(/(fonts/[^)]+)\)", lambda font: "url(" + data_uri(site / font[1]) + ")", css)
    return "<style>\n" + css + "\n</style>"


files = {p.relative_to(art).as_posix(): data_uri(p) for folder in ("layers", "choices")
         for p in sorted((art / folder).glob("*.webp"))}
scripts = ["window.HerdStudioFiles = " + json.dumps(files, separators=(",", ":")) + ";"]
script_tag = r'<script defer src="/([^"]+)"></script>'
for path in re.findall(script_tag, html):
    scripts.append((site / path).read_text())
html = re.sub(script_tag, "", html)
html = re.sub(r'<link rel="stylesheet" href="/([^"]+)">', inline_style, html)
html = html.replace('src="/assets/herd-studio/starter.webp"', 'src="' + data_uri(art / "starter.webp") + '"')
html = html.replace('href="/favicons/home.svg"', 'href="' + data_uri(site / "favicons/home.svg") + '"')
html = html.replace('href="/', 'href="https://bullenciaga.com/')
html = html.replace("</body>", "\n".join("<script>\n" + code + "\n</script>" for code in scripts) + "\n</body>")
out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html)
