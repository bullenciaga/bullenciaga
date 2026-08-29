#!/usr/bin/env python3
"""Build the public BULLENCIAGA whitepaper v2 PDF."""

from pathlib import Path
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
SAGA_ASSETS = ROOT.parent / "bullensaga-house-objects-v2" / "public" / "assets" / "collectibles"
OUTPUT = ROOT / "output" / "pdf" / "bullenciaga-whitepaper-v2.pdf"
PDF_ASSETS = ROOT / "qa" / "whitepaper-v2" / "assets"

PAGE_W, PAGE_H = A4
BG = colors.HexColor("#050505")
PANEL = colors.HexColor("#0b0b0a")
GOLD = colors.HexColor("#c7a869")
GOLD_LIGHT = colors.HexColor("#e8d9ae")
TEXT = colors.HexColor("#f5f3ee")
MUTED = colors.HexColor("#918d85")
DIM = colors.HexColor("#5f5c57")
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
            "table", fontName="Helvetica", fontSize=7.8, leading=10.5,
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


def on_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.rect(16*mm, 16*mm, PAGE_W-32*mm, PAGE_H-32*mm, stroke=1, fill=0)

    # A clean mirrored-B mark, drawn as typography so both halves are exact.
    canvas.setFillColor(GOLD)
    canvas.setFont("Helvetica-Bold", 56)
    cx, cy = PAGE_W/2, PAGE_H-70*mm
    canvas.saveState()
    canvas.translate(cx-1.5*mm, cy)
    canvas.scale(-1, 1)
    canvas.drawString(0, 0, "B")
    canvas.restoreState()
    canvas.drawString(cx+1.5*mm, cy, "B")
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.5)
    canvas.line(cx, cy-2*mm, cx, cy+16*mm)
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
    canvas.setFont("Helvetica", 6.7)
    canvas.drawString(20*mm, PAGE_H-11.5*mm, "BULLENCIAGA / WHITEPAPER 2.0")
    canvas.drawRightString(PAGE_W-20*mm, PAGE_H-11.5*mm, "29 AUGUST 2026")
    canvas.drawString(20*mm, 10.5*mm, "TOKEN / HERD / HOUSE OBJECTS / BULLENSAGA")
    canvas.drawRightString(PAGE_W-20*mm, 10.5*mm, f"{doc.page-1:02d}")
    canvas.restoreState()


def build_story():
    story = []
    story += [Spacer(1, 118*mm), p("BULLENCIAGA", "kicker")]
    cover_title = Paragraph("THE HOUSE,<br/>ON-CHAIN", ParagraphStyle(
        "cover_title", fontName="Times-Roman", fontSize=40, leading=42,
        textColor=TEXT, alignment=TA_LEFT, spaceAfter=16,
    ))
    story += [cover_title, Rule(GOLD, 0.8, 0, 13)]
    story += [p("Technical whitepaper 2.0", "lead")]
    story += [p("$BULLEN supply control, The Herd, House Objects and the BULLENSAGA founding record system.", "body")]
    story += [Spacer(1, 12*mm), p("SOLANA / TOKEN-2022 / METAPLEX CORE", "kicker")]
    story += [NextPageTemplate("content"), PageBreak()]

    story += page_title("01 / SYSTEM", "One connected House", "The token, the art and the game now share one public accounting model.")
    story += [p("BULLENCIAGA is a connected on-chain system: the Token-2022 $BULLEN asset, a fixed volume-triggered burn schedule, the 1,000-piece Herd, numbered House Objects, and BULLENSAGA. Each element has its own job; none is allowed to blur what actually happened on-chain.")]
    story += [p("One wallet. One escrow. One number.", "quote")]
    story += [p("ACCOUNTING RULE", "section")]
    story += [bullets([
        "An escrow deposit is published as <b>committed to burn</b>.",
        "A token is published as <b>destroyed</b> only after a confirmed Token-2022 burn reduces total supply.",
        "A preorder or manual award consumes numbered collectible inventory but never creates a fictional token-burn record.",
        "The supply curve, burn proof ledger and House Object commitment registry stay separate and reconcile through public transaction signatures.",
    ])]
    story += [Spacer(1, 5*mm), facts([
        ("1B", "original $BULLEN supply"),
        ("1,000", "Herd issue"),
        ("500", "new numbered records"),
        ("3", "published burn paths"),
        ("2", "new Core collections"),
        ("0", "new token mint authority"),
    ])]
    story += [PageBreak()]

    story += page_title("02 / TOKEN", "$BULLEN facts", "Authority, custody and proof are meant to be independently checked.")
    story += [data_table(
        ["Field", "Canonical value"],
        [
            ["Chain / program", "Solana / Token-2022"],
            ["Original supply", "1,000,000,000 $BULLEN"],
            ["Mint", "BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN"],
            ["Development wallet", "GV7XDVAkra3Kjr4b2f2nyYrhL9gqEx5gvevdkTBzyYmd"],
            ["Public burn escrow", "FUtAEk1TAVf2WZ3wqXeHYttqfpTftEf6qrprue5x6mLy"],
            ["Mint / freeze authority", "Revoked; read live from chain"],
        ],
        [46*mm, 124*mm],
    )]
    story += [Spacer(1, 6*mm), p("THE LOCKED SCHEDULE", "section")]
    story += [p("The 250,000,000-token launch allocation is not reported as circulating. It remains in Jupiter Lock between milestones. When a cumulative-volume threshold is reached, the due share is released, destroyed and the remainder relocked. The site links the current lock rather than pretending one escrow address remains permanent across every cycle.")]
    story += [p("Tier one executed on 11 August 2026 and destroyed 12,500,000 $BULLEN. Every later status is sourced from chain and DEX data, not from this PDF.")]
    story += [p("REFERRALS AND CREATOR FEES", "section")]
    story += [p("The existing referral ledger remains forward-only and public: a wallet signs its binding, buys after that point can earn the recorded referrer a share of measured creator fees, and weekly payouts are not fixed or guaranteed. The ten Grail and Legendary Herd pieces retain the previously published creator-fee participation model, calculated after marketing spend.")]
    story += [PageBreak()]

    story += page_title("03 / BURNS", "Three paths, one standard of proof", "Commitment and destruction are related events, not synonyms.")
    story += [data_table(
        ["Path", "Trigger", "Amount", "Public proof"],
        [
            ["Volume schedule", "Cumulative trading milestones", "250M max", "Confirmed burns / supply steps"],
            ["The Herd", "Public numbered claim", "250K each", "Escrow deposit, then scheduled burn"],
            ["House Objects", "Public Signet or Cufflinks claim", "100K each", "Escrow deposit, then scheduled burn"],
        ],
        [35*mm, 49*mm, 26*mm, 60*mm],
    )]
    story += [Spacer(1, 7*mm), p("VOLUME MILESTONES", "section")]
    story += [data_table(
        ["Tier", "Cumulative volume", "Running allocation burned", "Status"],
        [
            ["01", "$250,000", "5% / 12.5M", "Executed"],
            ["02", "$1,000,000", "15% / 37.5M", "Pending"],
            ["03", "$5,000,000", "30% / 75M", "Pending"],
            ["04", "$20,000,000", "55% / 137.5M", "Pending"],
            ["05", "$50,000,000", "100% / 250M", "Pending"],
        ],
        [18*mm, 43*mm, 66*mm, 43*mm],
    )]
    story += [Spacer(1, 7*mm), p("THE TOKEN-2022 ESCROW LIFECYCLE", "section")]
    story += [bullets([
        "The holder signs a Token-2022 <b>TransferChecked</b> for the exact published amount into the canonical burn escrow token account.",
        "The allocation ledger verifies the mint, source wallet, destination escrow, decimals and signature before a numbered record leaves inventory.",
        "The commitment registry publishes the deposit proof immediately without subtracting it from total supply.",
        "The scheduled burner later signs the Token-2022 burn. Only then does the supply history and signed burn ledger show the reduction.",
    ])]
    story += [PageBreak()]

    story += page_title("04 / THE HERD", "A thousand pieces, paid in participation", "The original collection remains intact and continues to carry the first major burn-to-collect mechanism.")
    story += [facts([
        ("1,000", "numbered pieces"),
        ("250K", "$BULLEN per public claim"),
        ("250M", "maximum complete-run burn"),
    ])]
    story += [Spacer(1, 8*mm), p("COLLECTION", "section")]
    story += [p("The Herd spans twelve trait categories with weighted rarity from Common through Grail. Five unnumbered Grail pieces and five numbered Legendary compositions sit outside the ordinary trait pool. The original assets are not rewritten to install House Objects; ownership is read wallet-wide and the site can render status or equipment around whichever Herd piece the holder selects.")]
    story += [p("CREATOR-FEE PARTICIPATION", "section")]
    story += [data_table(
        ["Tier", "Pieces", "Share each", "Combined"],
        [["Grail", "5", "2.5%", "12.5%"], ["Legendary", "5", "1.5%", "7.5%"]],
        [42.5*mm]*4,
    )]
    story += [Spacer(1, 5*mm), p("Percentages apply to post-marketing creator fee revenue. Payouts scale with actual trading activity and are not fixed, guaranteed, or a promise of value.", "small")]
    story += [p("HOUSE LAYER", "section")]
    story += [bullets([
        "The Signet adds the founding House mark, private access and published first-refusal eligibility.",
        "The Cufflinks complete House Pair I.",
        "A wallet holding both at the future published snapshot can receive The Key without a second token payment.",
        "All gating checks current on-chain ownership because every House Object is transferable.",
    ])]
    story += [PageBreak()]

    story += page_title("05 / HOUSE OBJECTS", "The first pair", "Two restrained objects, one shared numbered allocation.")
    story += [image_pair(
        "house-object-01-signet.png", "HOUSE OBJECT 01 / THE SIGNET / 100 EDITIONS",
        "house-object-02-cufflinks.png", "HOUSE OBJECT 02 / THE CUFFLINKS / 100 EDITIONS",
    )]
    story += [Spacer(1, 6*mm), p("PUBLIC CLAIM", "section")]
    story += [p("A public claim commits exactly 100,000 $BULLEN to burn escrow and reserves the lowest available serial. Existing holders receive a 48-hour first-access window before the claim becomes public. Estate Founding I and explicit manual awards draw from the same 100-edition rows; no hidden allocation can oversell them.")]
    story += [p("HOLDER STATUS", "section")]
    story += [bullets([
        "Pairing and visible set progression.",
        "Private access and curated participation when announced.",
        "Priority for future physical releases when practical and explicitly published.",
        "Transferable status: access follows current ownership, not the first recipient.",
        "A later free Key award for the published Pair I snapshot.",
    ])]
    story += [PageBreak()]

    story += page_title("06 / BULLENSAGA", "Founding records for the game", "The Promise and the Triad connect preorder entitlement to the same controlled fulfillment system.")
    story += [image_pair(
        "promise-nft.png", "THE PROMISE / 200 MAXIMUM",
        "triad-nft.png", "THE TRIAD / 100 MAXIMUM",
    )]
    story += [Spacer(1, 6*mm), data_table(
        ["Edition", "Founding I records"],
        [
            ["House", "The Promise"],
            ["Estate", "The Promise + The Triad + The Signet + The Cufflinks"],
        ],
        [42*mm, 128*mm],
    )]
    story += [Spacer(1, 5*mm), p("The Promise is capped at 200. The Triad is capped at 100. Estate Founding I can be sold only when all four promised rows can be reserved together. If the first House Object pair closes, a later Estate wave can explicitly name Objects 03 and 04; an already-paid Founding I order is never silently downgraded or substituted.")]
    story += [PageBreak()]

    story += page_title("07 / ISSUANCE", "Two collections, controlled automation", "Candy Machines are unnecessary for a numbered, server-issued system with several valid allocation paths.")
    story += [data_table(
        ["Collection", "Series", "Cap"],
        [
            ["BULLENCIAGA - HOUSE OBJECTS", "The Signet", "100"],
            ["BULLENCIAGA - HOUSE OBJECTS", "The Cufflinks", "100"],
            ["BULLENSAGA - FOUNDING RECORDS", "The Promise", "200"],
            ["BULLENSAGA - FOUNDING RECORDS", "The Triad", "100"],
        ],
        [78*mm, 67*mm, 25*mm],
    )]
    story += [Spacer(1, 7*mm), p("AUTHORITY MODEL", "section")]
    story += [bullets([
        "The personal development wallet is the named root update authority on both Metaplex Core collections.",
        "The isolated Turnkey issuer is attached as collection Update Delegate for automated numbered delivery.",
        "The development wallet is the sole creator at a 10% collection royalty and remains the wallet used to claim marketplace profiles.",
        "The personal development seed is never placed in Turnkey, Cloudflare, the repository, Drive or browser code.",
        "The issuer carries only a reloadable SOL operating balance. If it is low, paid jobs remain queued until it is funded.",
    ])]
    story += [p("DELIVERY", "section")]
    story += [p("A verified payment, escrow claim or manual award allocates one numbered row and creates one durable mint job. The worker derives one deterministic asset address, preflights the chain before retries, builds only approved Core create transactions, and writes the confirmed address and signature back to the same row. A retry cannot consume a second serial.")]
    story += [PageBreak()]

    story += page_title("08 / SUPPLY", "Maximums without double counting", "The headline number changes only when the chain does.")
    story += [data_table(
        ["Mechanism", "Maximum", "Condition"],
        [
            ["Volume schedule", "250,000,000", "All five milestones execute"],
            ["The Herd", "250,000,000", "All 1,000 public claims are deposited and burned"],
            ["House Objects 01 + 02", "20,000,000", "All 200 enter through public claims and are burned"],
        ],
        [56*mm, 45*mm, 69*mm],
    )]
    story += [Spacer(1, 7*mm), facts([
        ("500M", "fixed schedule + complete Herd"),
        ("20M", "initial House public-claim ceiling"),
        ("520M", "combined theoretical ceiling"),
    ])]
    story += [Spacer(1, 7*mm), p("The 520M figure is a theoretical ceiling, not a forecast. It requires every volume tier, every public Herd claim, and all 200 first-wave House Objects to enter through the public burn route. Any House Object allocated by preorder or manual award still reduces inventory but does not add 100,000 to burn commitments. The live supply endpoint is always the current authority.")]
    story += [p("PUBLIC DISPLAYS", "section")]
    story += [bullets([
        "<b>/stats</b> shows current supply, scheduled burns, Herd mints and House Object commitments.",
        "<b>/chart</b> keeps price/supply events separate from unburned escrow deposits.",
        "<b>/curve</b> pairs the signed burn ledger with a second deposit-proof ledger.",
        "The main page shows public claims, committed $BULLEN and remaining Signet/Cufflinks inventory.",
    ])]
    story += [PageBreak()]

    story += page_title("09 / ROADMAP", "The House opens in layers", "Volume milestones govern the locked schedule; product phases can proceed independently.")
    story += [data_table(
        ["Phase", "Name", "Published scope"],
        [
            ["01", "Deploy $BULLEN", "Token and The Herd go live"],
            ["02", "First Blood", "$250K tier executed 11 Aug 2026"],
            ["03", "The House Fills Up", "$1M and $5M burn tiers"],
            ["04", "Full Sprint", "$20M burn tier"],
            ["05", "The Vault Empties", "$50M; locked allocation fully burned"],
            ["06", "House Objects", "Signet and Cufflinks; first 100 each"],
            ["07", "BULLENSAGA", "Game preorders and founding records"],
            ["08", "$BULLEN Staking", "Published terms before activation"],
            ["09", "The Collab", "Fashion-industry collaborations"],
        ],
        [18*mm, 50*mm, 102*mm],
    )]
    story += [Spacer(1, 7*mm), p("Phases 06 through 09 are not gated by cumulative volume and may complete in a different order. Staking rewards, physical priority, curated participation, the Key snapshot and collaboration terms do not exist merely because they are named here; each requires its own published rules before activation.", "small")]
    story += [PageBreak()]

    story += page_title("10 / VERIFY", "Read the records, not the promise", "Every number intended to matter has a public place to be checked.")
    story += [bullets([
        "Mint and freeze authority, live supply and circulating supply: <b>bullenciaga.com</b> and <b>/supply</b>.",
        "Current lock and release custody: <b>bullenciaga.com/lock</b>.",
        "Per-transaction burn proof and reconciliation: <b>bullenciaga.com/supply/proof</b>.",
        "Supply history and curve: <b>bullenciaga.com/curve</b>.",
        "House Object escrow-deposit commitments: the main page and its shared registry on <b>/stats</b>, <b>/chart</b> and <b>/curve</b>.",
        "Referral bindings and payouts: <b>bullenciaga.com/refer</b>.",
        "Current NFT ownership, collection authority and transfers: Solana explorers and compatible wallets/marketplaces.",
    ])]
    story += [Spacer(1, 6*mm), p("RISK DISCLOSURE", "section")]
    story += [p("$BULLEN is a community token, not a security, and this document is not financial advice. Cryptocurrency markets are volatile. Token value, liquidity, NFT value, marketplace support, creator-fee revenue, referral payouts, staking rewards, physical production and delivery timelines are not guaranteed. Burn timing depends on organic trading and real claims. Smart-contract, infrastructure, wallet, RPC, marketplace, regulatory and operational risks remain.")]
    story += [p("Collection royalty settings can express the project's requested 10% royalty but marketplace enforcement and buyer behaviour may vary. Transferable status follows current ownership, so a seller gives up the associated access. Users should verify authority, balances, signatures and ownership independently before acting.")]
    story += [Spacer(1, 8*mm), Rule(GOLD, 0.8, 0, 12), p("THE HOUSE DOES NOT ASK TO BE BELIEVED.<br/>IT LEAVES A RECORD.", "lead")]
    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frame = Frame(20*mm, 20*mm, PAGE_W-40*mm, PAGE_H-40*mm, leftPadding=0, rightPadding=0, topPadding=5*mm, bottomPadding=5*mm)
    doc = BaseDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=20*mm, rightMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm,
        title="BULLENCIAGA Whitepaper 2.0",
        author="BULLENCIAGA",
        subject="Token-2022 supply, The Herd, House Objects and BULLENSAGA",
    )
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[frame], onPage=on_cover),
        PageTemplate(id="content", frames=[frame], onPage=on_content),
    ])
    doc.build(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
