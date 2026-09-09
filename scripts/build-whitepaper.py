#!/usr/bin/env python3
"""Render the public whitepaper directly from docs/WHITEPAPER_V2_SOURCE.md."""

from pathlib import Path
import shutil
import re
import html
import os
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, KeepTogether, NextPageTemplate,
    PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SAGA_ASSETS = Path(os.environ.get("BULLEN_WHITEPAPER_ASSETS", ROOT.parent / "bullensaga-site" / "public" / "assets" / "collectibles"))
SOURCE = ROOT / "docs" / "WHITEPAPER_V2_SOURCE.md"
COPY = SOURCE.read_text(encoding="utf-8")
VERSION = re.search(r"<!-- version: (.+?) -->", COPY).group(1)
EDITION_DATE = re.search(r"<!-- date: (.+?) -->", COPY).group(1)
OUTPUT = ROOT / "output" / "pdf" / "bullenciaga-whitepaper-v2.pdf"
SITE_OUTPUT = ROOT / "site" / "whitepaper.pdf"
PDF_ASSETS = ROOT / "qa" / "whitepaper-v2" / "assets"

PAGE_W, PAGE_H = A4
BG = colors.HexColor("#050505")
PANEL = colors.HexColor("#0b0b0a")
GOLD = colors.HexColor("#c7a869")
GOLD_LIGHT = colors.HexColor("#e8d9ae")
TEXT = colors.HexColor("#f5f3ee")
MUTED = colors.HexColor("#918d85")
DIM = colors.HexColor("#918d85")
RED = colors.HexColor("#b4483f")
LINE = colors.Color(199/255, 168/255, 105/255, alpha=0.24)


class Rule(Flowable):
    def __init__(self, color=LINE, thickness=0.6, space_before=4, space_after=10):
        super().__init__()
        self.color = color
        self.thickness = thickness
        self.space_before = space_before
        self.space_after = space_after
        self.height = space_before + thickness + space_after

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.space_after, self._availWidth, self.space_after)

    def wrap(self, avail_width, avail_height):
        self._availWidth = avail_width
        return avail_width, self.height


def styles():
    return {
        "kicker": ParagraphStyle(
            "kicker", fontName="Helvetica", fontSize=8.2, leading=11,
            textColor=GOLD, tracking=2.2, spaceAfter=9,
        ),
        "title": ParagraphStyle(
            "title", fontName="Times-Roman", fontSize=29, leading=32,
            textColor=TEXT, spaceAfter=12,
        ),
        "lead": ParagraphStyle(
            "lead", fontName="Times-Roman", fontSize=14, leading=20,
            textColor=GOLD_LIGHT, spaceAfter=14,
        ),
        "body": ParagraphStyle(
            "body", fontName="Helvetica", fontSize=9.4, leading=14.1,
            textColor=colors.HexColor("#d6d2ca"), spaceAfter=10,
        ),
        "small": ParagraphStyle(
            "small", fontName="Helvetica", fontSize=7.8, leading=11.7,
            textColor=MUTED, spaceAfter=7,
        ),
        "section": ParagraphStyle(
            "section", fontName="Helvetica-Bold", fontSize=9.2, leading=12,
            textColor=GOLD, tracking=1.8, spaceBefore=7, spaceAfter=8,
        ),
        "quote": ParagraphStyle(
            "quote", fontName="Times-Italic", fontSize=13, leading=18,
            textColor=GOLD_LIGHT, leftIndent=12, rightIndent=12,
            borderColor=GOLD, borderWidth=0, borderPadding=0, spaceAfter=14,
        ),
        "table_head": ParagraphStyle(
            "table_head", fontName="Helvetica-Bold", fontSize=7.1, leading=9,
            textColor=GOLD, tracking=0.8,
        ),
        "table": ParagraphStyle(
            "table", fontName="Helvetica", fontSize=8.2, leading=11.5,
            textColor=TEXT,
        ),
        "card_num": ParagraphStyle(
            "card_num", fontName="Times-Roman", fontSize=20, leading=22,
            textColor=GOLD_LIGHT,
        ),
        "card_label": ParagraphStyle(
            "card_label", fontName="Helvetica", fontSize=6.8, leading=9,
            textColor=MUTED, tracking=0.8,
        ),
        "caption": ParagraphStyle(
            "caption", fontName="Helvetica", fontSize=7.5, leading=10.5,
            textColor=MUTED, alignment=TA_CENTER,
        ),
    }


S = styles()


def p(text, style="body"):
    return Paragraph(text, S[style])


def bullets(items):
    rows = []
    for item in items:
        rows.append([p("-", "body"), p(item, "body")])
    table = Table(rows, colWidths=[4*mm, 166*mm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return table


def facts(items, columns=3):
    cell_width = 170*mm/columns
    cells = []
    for value, label in items:
        cells.append(Table([
            [p(value, "card_num")], [p(label.upper(), "card_label")]
        ], colWidths=[cell_width-20]))
    rows = [cells[i:i+columns] for i in range(0, len(cells), columns)]
    while len(rows[-1]) < columns:
        rows[-1].append("")
    table = Table(rows, colWidths=[cell_width]*columns)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return table


def data_table(headers, rows, widths):
    data = [[p(h.upper(), "table_head") for h in headers]]
    data += [[p(str(cell), "table") for cell in row] for row in rows]
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#11100d")),
        ("BACKGROUND", (0, 1), (-1, -1), PANEL),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.Color(1, 1, 1, alpha=0.08)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def image_pair(left_name, left_caption, right_name, right_caption):
    side = 81*mm
    left = Image(str(pdf_image(left_name)), width=side, height=side)
    right = Image(str(pdf_image(right_name)), width=side, height=side)
    table = Table([
        [left, right],
        [p(left_caption, "caption"), p(right_caption, "caption")],
    ], colWidths=[84*mm, 84*mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, 0), 4),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
        ("TOPPADDING", (0, 1), (-1, 1), 7),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 7),
    ]))
    return table


def pdf_image(name):
    """Create a review-only JPEG derivative; masters remain untouched."""
    PDF_ASSETS.mkdir(parents=True, exist_ok=True)
    source = SAGA_ASSETS / name
    target = PDF_ASSETS / (source.stem + ".jpg")
    if not target.exists() or target.stat().st_mtime < source.stat().st_mtime:
        with PILImage.open(source) as image:
            image = image.convert("RGB")
            image.thumbnail((1200, 1200), PILImage.Resampling.LANCZOS)
            image.save(target, "JPEG", quality=90, optimize=True, progressive=True)
    return target


def page_title(number, title, lead):
    return [p(number, "kicker"), p(title, "title"), p(lead, "lead"), Rule()]


def inline(text):
    """Only the inline Markdown supported by this source; escape all other markup."""
    parts = re.split(r"(\[[^\]]+\]\(https://[^)]+\))", text)
    rendered = []
    for part in parts:
        link = re.fullmatch(r"\[([^\]]+)\]\((https://[^)]+)\)", part)
        if link:
            label, url = link.groups()
            rendered.append(f'<link href="{html.escape(url, quote=True)}" color="#e8d9ae"><u>{html.escape(label)}</u></link>')
        else:
            safe = html.escape(part)
            rendered.append(re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", safe))
    return ''.join(rendered)


def single_image(name, caption):
    source = pdf_image(name)
    with PILImage.open(source) as im:
        width, height = im.size
    draw_height = 76*mm
    draw_width = draw_height * width / height
    image = Image(str(source), width=draw_width, height=draw_height)
    image.hAlign = "CENTER"
    return KeepTogether([image, Spacer(1, 3*mm), p(inline(caption), "caption"), Spacer(1, 4*mm)])


def render_page(source):
    lines = source.strip().splitlines()
    result = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith('# '):
            result.append(p(inline(line[2:]), 'kicker'))
        elif line.startswith('## '):
            heading = p(inline(line[3:]), 'title')
            heading.bookmark = 'page-' + re.match(r'# (\d+)', lines[0]).group(1)
            heading.outline_title = line[3:]
            result.append(heading)
        elif line.startswith('### '):
            result.append(p(inline(line[4:].upper()), 'section'))
        elif line.startswith('> '):
            result.extend([p(inline(line[2:]), 'lead'), Rule()])
        elif line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?', c) for c in cells):
                    rows.append([inline(c) for c in cells])
                i += 1
            widths = {
                2: [48*mm, 122*mm],
                3: [42*mm, 49*mm, 79*mm],
                4: [58*mm, 24*mm, 44*mm, 44*mm],
            }[len(rows[0])]
            result.extend([data_table(rows[0], rows[1:], widths), Spacer(1, 4*mm)])
            continue
        elif line.startswith('!['):
            images = []
            while i < len(lines) and lines[i].strip().startswith('!['):
                match = re.fullmatch(r'!\[([^\]]+)\]\(([^)]+)\)', lines[i].strip())
                if not match:
                    raise ValueError(f'Invalid image: {lines[i]}')
                caption, name = match.groups()
                images.append((name, caption))
                i += 1
            if len(images) == 2:
                result.append(image_pair(images[0][0], inline(images[0][1]), images[1][0], inline(images[1][1])))
                result.append(Spacer(1, 5*mm))
            elif len(images) == 1:
                result.append(single_image(*images[0]))
            else:
                raise ValueError('Use one image or one adjacent pair per block')
            continue
        elif line.startswith('- '):
            items = []
            while i < len(lines) and lines[i].strip().startswith('- '):
                items.append(inline(lines[i].strip()[2:]))
                i += 1
            result.append(bullets(items))
            continue
        elif re.match(r'\d+\. ', line):
            result.append(p(inline(line)))
        else:
            paragraph = [line]
            while i+1 < len(lines) and lines[i+1].strip():
                i += 1
                paragraph.append(lines[i].strip())
            result.append(p(inline(' '.join(paragraph))))
        i += 1
    return result


def on_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.rect(16*mm, 16*mm, PAGE_W-32*mm, PAGE_H-32*mm, stroke=1, fill=0)
    canvas.setFillColor(GOLD)
    canvas.setFont('Helvetica', 8)
    canvas.drawString(23*mm, PAGE_H-35*mm, 'BULLENCIAGA / WHITEPAPER ' + VERSION)
    canvas.setFillColor(MUTED)
    canvas.drawString(23*mm, 30*mm, EDITION_DATE.upper())
    canvas.linkURL('https://bullenciaga.com/whitepaper', (23*mm, 27*mm, 100*mm, 34*mm))
    canvas.restoreState()


def on_content(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(20*mm, PAGE_H-15*mm, PAGE_W-20*mm, PAGE_H-15*mm)
    canvas.line(20*mm, 15*mm, PAGE_W-20*mm, 15*mm)
    canvas.setFillColor(DIM)
    canvas.setFont('Helvetica', 6.7)
    canvas.drawString(20*mm, PAGE_H-11.5*mm, 'BULLENCIAGA / WHITEPAPER ' + VERSION)
    canvas.drawRightString(PAGE_W-20*mm, PAGE_H-11.5*mm, EDITION_DATE.upper())
    canvas.drawString(20*mm, 10.5*mm, 'TOKEN / HERD / HOUSE OBJECTS / BULLENSAGA')
    canvas.drawRightString(PAGE_W-20*mm, 10.5*mm, f'{doc.page-1:02d}')
    canvas.restoreState()


class WhitepaperDoc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark'):
            self.canv.bookmarkPage(flowable.bookmark)
            self.canv.addOutlineEntry(flowable.outline_title, flowable.bookmark, 0, False)


def build_story():
    story = [Spacer(1, 105*mm)]
    story.append(Paragraph('THE HOUSE,<br/>ON-CHAIN', ParagraphStyle(
        'cover_title', fontName='Times-Roman', fontSize=40, leading=42,
        textColor=TEXT, alignment=TA_LEFT, spaceAfter=16,
    )))
    story.extend([Rule(GOLD, 0.8, 0, 13), p('A living system. A verifiable record.', 'lead')])
    story.append(p('$BULLEN supply control, the HERD, House Objects, private rooms and the BULLENSAGA game in production.'))
    story.extend([Spacer(1, 8*mm), p('SOLANA / TOKEN-2022 / METAPLEX CORE', 'kicker')])
    story.extend([NextPageTemplate('content'), PageBreak()])
    clean = re.sub(r'<!--.*?-->', '', COPY, flags=re.S).strip()
    pages = clean.split('\n---\n')
    for i, page in enumerate(pages):
        story.extend(render_page(page))
        if i < len(pages)-1:
            story.append(PageBreak())
    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    content_frame = Frame(20*mm, 20*mm, PAGE_W-40*mm, PAGE_H-40*mm,
        leftPadding=0, rightPadding=0, topPadding=5*mm, bottomPadding=5*mm)
    cover_frame = Frame(23*mm, 20*mm, PAGE_W-46*mm, PAGE_H-40*mm,
        leftPadding=0, rightPadding=0, topPadding=5*mm, bottomPadding=5*mm)
    doc = WhitepaperDoc(str(OUTPUT), pagesize=A4,
        title='BULLENCIAGA Whitepaper ' + VERSION, author='BULLENCIAGA',
        subject='Token supply, collectibles, live systems and BULLENSAGA support',
        pageCompression=1)
    doc.addPageTemplates([
        PageTemplate(id='cover', frames=[cover_frame], onPage=on_cover),
        PageTemplate(id='content', frames=[content_frame], onPage=on_content),
    ])
    doc.build(build_story())
    SITE_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(OUTPUT, SITE_OUTPUT)
    print(OUTPUT)


if __name__ == '__main__':
    main()
