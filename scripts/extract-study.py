"""Extract the supplied study. Requires pdftotext and an IBGE municipality snapshot.
Run: python3 scripts/extract-study.py path/to/study.pdf /tmp/chuvas-ibge.json
No numerical correction of inconsistencies in the source is performed.
"""

import sys, subprocess, json, re, unicodedata, hashlib, math
from pathlib import Path

pdf = Path(sys.argv[1])
ibge = json.load(open(sys.argv[2]))
text = subprocess.check_output(["pdftotext", "-layout", str(pdf), "-"]).decode()
pages = text.split("\f")


def norm(s):
    return re.sub(
        "[^a-z0-9]",
        "",
        unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower(),
    )


ids = {norm(r["nome"]): (str(r["id"]), r["nome"]) for r in ibge}
num = r"([+-]?\d+(?:\.\d+)?)"
pattern = re.compile(
    num
    + r"\(t\+"
    + num
    + r"\)"
    + num
    + r"\+"
    + num
    + r"\(t\+"
    + num
    + r"\)"
    + num
    + r"\.?\["
    + num
    + num
    + r"lnln"
)
municipalities = []
equations = []
report = []


def general(C, to, n, m, unit="mm_min", mx=1440, k=0, d=0, p=0):
    return dict(
        family="GENERAL",
        unit=unit,
        duration_min=10,
        duration_max=mx,
        parameters=dict(C=C, to=to, n=n, m=m, k=k, d=d, p=p),
    )


def gumbel(v, mi=10, ma=1440):
    return dict(
        family="GUMBEL",
        unit="mm_min",
        duration_min=mi,
        duration_max=ma,
        parameters=dict(zip(["A", "B", "C", "D", "E", "F", "G", "H"], v)),
    )


for j in range(75):
    physical = 35 + j * 3
    page = pages[physical - 1]
    header = page[: page.find("Tabela 4.")]
    name = re.search(r"4\.\d+.*?para (.+)", header)[1].strip()
    ident, official = ids[norm(name)]
    station = re.search(r"Nome da esta[çc][aã]o\s*/?\s*Entidade:\s*(.+)", header)[1]
    author = re.search(r"Autor(?:es)?:\s*(.+)", header)[1]
    form = header[header.find("\n", header.find("Período")) :]
    form = (
        form[re.search(r"\n\s*[iI].*?=", form).start() :]
        if re.search(r"\n\s*[iI].*?=", form)
        else form
    )
    form = form.split("Onde")[0].strip()
    normalized = (
        re.sub(r"\s+", "", form)
        .replace("–", "-")
        .replace("−", "-")
        .replace(",", ".")
        .replace(").", ")")
    )
    segments = []
    for m in pattern.finditer(normalized):
        segments.append(gumbel(list(map(float, m.groups()))))
    if j == 1:
        segments[0]["duration_max"] = 105
        segments[1]["duration_min"] = 105
    if j == 26:
        segments[0]["duration_max"] = 120
        segments[1]["duration_min"] = 120
    if j == 11:
        segments = [general(42.081, 20, 0.9483, 0.1429)]
    if j == 25:
        segments = [general(2507, 19, 0.91, 0.1748, "mm_h")]
        segments[0]["duration_min"] = 5
    if j == 33:
        # Visual transcription, physical PDF p.134. Unit is preserved as printed.
        segments = [general(4653.8, 25, 0, 0.1726, mx=120, k=1.087, d=0.0056)]
        form = "i = 4653.8 T^0.1726 / (t+25)^(1.087 T^0.0056); unidade impressa mm/min"
    if j == 39:
        segments = [general(2667, 20, 0.96, 0.1366, "mm_h")]
    if j == 54:
        segments = [
            gumbel(
                [43.5, -0.1, 0.374, 15.4 * 0.77969, 0, 0.374, -0.57722, -1], 10, 168
            ),
            gumbel(
                [54.9, -0.1, 0.140, 15.4 * 0.77969, 0, 0.374, -0.57722, -1], 168, 606
            ),
            gumbel(
                [54.9, -0.1, 0.140, 26.4 * 0.77969, 0, 0.140, -0.57722, -1], 606, 1440
            ),
        ]
    if j == 56:
        segments = [
            gumbel([15.53, 20, -0.76, 6.08, 20, -0.76, 0, -1], 10, 60),
            gumbel([8.60, 0, -0.662, 3.36, 0, -0.662, 0, -1], 60, 1440),
        ]
    if j == 59:
        segments = [general(25.33, 16, 0.935, 0.236)]
    if j == 66:
        segments = [
            gumbel([33.54, 20, -0.903, 1.27, 10, -0.461, -0.479, -0.883], 10, 60),
            gumbel([26.26, 20, -0.851, 5.73, 10, -0.781, -0.479, -0.883], 60, 1440),
        ]
    if j == 51:
        segments[0]["duration_min"] = (
            109  # Preserved as printed, not silently corrected to 10.
        )
    if j == 71:
        # Printed lower bound 9910 exceeds upper bound. Retain candidate coefficients, block use.
        pass
    if not segments:
        raise ValueError((j, name, normalized))

    def intensity(t, T):
        s = next(
            (s for s in segments if s["duration_min"] <= t <= s["duration_max"]), None
        )
        if not s:
            return None
        p = s["parameters"]
        if s["family"] == "GUMBEL":
            v = p["A"] * (t + p["B"]) ** p["C"] + p["D"] * (t + p["E"]) ** p["F"] * (
                p["G"] + p["H"] * math.log(math.log1p(1 / (T - 1)))
            )
        else:
            v = (
                p["C"] * T ** p["m"] / (t + p["to"]) ** (p["n"] + p["k"] * T ** p["d"])
                + p["p"]
            )
        return v * (60 if s["unit"] == "mm_min" else 1)

    checks = []
    bad = []
    table = page[page.find("Tabela 4.") :].split("Tabela 4.", 2)[1]
    for line in table.splitlines():
        vals = re.findall(r"(?<!\S)\d+(?:,\d+)?(?!\S)", line)
        if len(vals) == 10 and int(vals[0]) in [
            10,
            20,
            30,
            60,
            120,
            180,
            360,
            720,
            1080,
            1440,
        ]:
            t = int(vals[0])
            for T, v in zip([2, 5, 10, 15, 20, 25, 50, 100, 200], vals[1:]):
                expected = float(v.replace(",", "."))
                calc = intensity(t, T)
                checks.append(
                    dict(duration=t, return_period=T, intensity_mm_h=expected)
                )
                if calc is not None and abs(calc - expected) > max(
                    0.25, expected * 0.01
                ):
                    bad.append((t, T, round(calc, 3), expected))
    notes = []
    if bad:
        notes.append(
            f"Divergência fórmula/tabela em {len(bad)} pontos (tolerância max(0,25 mm/h; 1%)). Exemplo t={bad[0][0]}, T={bad[0][1]}: calculado {bad[0][2]} vs tabela {bad[0][3]}."
        )
    if j == 51:
        notes.append(
            "Limite inferior impresso 109 min; tabela inclui durações menores. Revisão necessária."
        )
    if j == 71:
        notes.append(
            "Limite inferior impresso 9910 min, superior 1440 min. Domínio contraditório; revisão necessária."
        )
    if not checks:
        notes.append("Tabela não extraída; validação manual necessária.")
    status = "pending" if notes else "active"
    coords = re.search(
        r"(?:Coordenadas geográficas|Coordenadas geogr[áa]ficas):?\s*(.+)", header
    )
    lat = lon = None
    if coords:
        degrees = re.findall(
            r"(\d+)[°ºo]\s*(\d+)[’\x27\x60](?:(\d+)[’\x27\x60]{1,2})?", coords[1]
        )
        if len(degrees) >= 2:
            lat, lon = [
                -(float(a) + float(b) / 60 + (float(c) / 3600 if c else 0))
                for a, b, c in degrees[:2]
            ]
    municipalities.append(
        dict(id=ident, ibge_code=ident, name=official, latitude=lat, longitude=lon)
    )
    eq = dict(
        id=f"{ident}-v1",
        municipality_id=ident,
        version=1,
        status=status,
        return_min=2,
        return_max=200,
        station_name=station,
        station_prefix=(re.search(r"[A-F]\d-\d{3}[RM]?", station) or [""])[0],
        source_page=physical - 24,
        source_pdf_page=physical,
        source_author=author,
        source_formula=form,
        segments=segments,
        review_notes=" ".join(notes),
        reference_checks=checks,
    )
    equations.append(eq)
    report.append(
        dict(
            municipality=official,
            status=status,
            reference_points=len(checks),
            mismatches=len(bad),
            notes=" ".join(notes),
        )
    )
out = dict(
    source=dict(
        title="Precipitações intensas no Estado de São Paulo",
        publisher="DAEE / CTH",
        cover_date="Maio de 2018",
        supplied_filename=pdf.name,
        sha256=hashlib.sha256(pdf.read_bytes()).hexdigest(),
        validation_tolerance="max(0.25 mm/h, 1%); all extracted intensity table points",
    ),
    municipalities=municipalities,
    equations=equations,
)
Path("data/catalog.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2) + "\n"
)
Path("data/validation-report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n"
)
print(
    "Imported",
    len(equations),
    "equations; active",
    sum(e["status"] == "active" for e in equations),
    "pending",
    sum(e["status"] == "pending" for e in equations),
)
for r in report:
    if r["status"] == "pending":
        print(r)
