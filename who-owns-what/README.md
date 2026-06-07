# Who Owns What?

A source-first transparency reference for corporate ownership, wealth, and influence. Search a
company, billionaire, or executive and see ownership, executive pay, lobbying, political spending,
fines, and labor issues in one readable place — **with a primary-source link on every claim.**

It's the "IMDB / Wikipedia of economic power": not an investing site, but a way to track and explain
*who owns what, who benefits financially, and how economic power is structured* — without requiring
hours of digging through SEC filings and lobbying databases.

## Why

Pieces of this information already exist across excellent specialist sites (OpenSecrets, LittleSis,
OpenCorporates, WhaleWisdom, Macrotrends, North Data, Dun & Bradstreet, and others — see the in-app
**About** page). The gap, as the original idea thread put it, is that those sources are **hard reads
for the average person**: buried in dense reports, confusing menus, and academic language. This app
brings the public record together in plain language, with sources attached.

## What it does

**Company profiles** show:
- Largest shareholders
- CEO compensation
- Median employee pay
- CEO-to-worker pay ratio
- Lobbying expenditures
- Political donations / PAC spending
- Regulatory fines and settlements
- Labor disputes and unionization efforts
- Market position and competitors
- A timeline of major events

**Person profiles** (executives, controlling shareholders, billionaires) show:
- Net-worth estimates
- Companies controlled / owned
- Major assets
- Board memberships
- Foundations
- Political spending
- A timeline of major events

**Discover** shows headline stats and plain-language daily fact cards like *"Who owns the largest
shares of major grocery chains?"* and *"How does CEO pay compare to worker pay?"*

Every data point renders with a 🔗 source chip linking to the underlying record.

## The rules

- **Everything is sourced.** Every figure links to a primary public record — SEC filings, FEC /
  OpenSecrets data, court and regulator databases, or official company reports.
- **No unsourced allegations.** No conspiracy content, no partisan spin.
- **Public figures and public companies only.** People with concentrated economic or political
  power and the organizations they run — not private individuals. Publicly disclosed data only. This
  keeps the project on the right side of the privacy concern raised in the original discussion
  (transparency, not stigmatization or witch hunts).
- **Not an investing site.** No financial advice.

## Primary sources

| Source | Used for |
|--------|----------|
| [SEC EDGAR](https://www.sec.gov/edgar/search/) | Proxy statements (DEF 14A), 10-Ks, 8-Ks, 13F/13D holdings, pay-ratio disclosures |
| [OpenSecrets](https://www.opensecrets.org/) | Lobbying and campaign-finance data |
| [FEC](https://www.fec.gov/data/) | Federal campaign contributions |
| [Violation Tracker](https://violationtracker.goodjobsfirst.org/) | Regulatory penalties and settlements |
| [NLRB](https://www.nlrb.gov/search/case) | Labor cases and union elections |
| [ProPublica Nonprofit Explorer](https://projects.propublica.org/nonprofits/) | Foundation Form 990s |
| [Forbes](https://www.forbes.com/billionaires/) | Net-worth estimates |

## Running it

This is a static site — no build step, no dependencies.

```bash
cd who-owns-what
python3 -m http.server 8080
# then open http://localhost:8080
```

Or deploy the folder to GitHub Pages, Netlify, Vercel, or any static host.

> **Note:** it must be served over HTTP (not opened as a `file://` URL) because it loads the JSON
> data files with `fetch()`.

## Project structure

```
who-owns-what/
├── index.html            # App shell + header search + footer
├── styles.css            # Dark, responsive, mobile-first styling
├── app.js                # Hash-router SPA: data loading, search, profiles, fact cards
├── data/
│   ├── companies.json    # Curated, sourced company profiles
│   ├── people.json       # Curated, sourced person profiles
│   └── factcards.json    # Headline stats + plain-language fact cards
└── README.md
```

## Data model

Each fact carries its own source so sourcing is enforced by structure, not convention:

```jsonc
{
  "ceoPay": {
    "name": "Doug McMillon",
    "amount": "~$27 million",
    "year": "FY2024",
    "source": { "name": "SEC DEF 14A Proxy Statement", "url": "https://www.sec.gov/..." }
  }
}
```

## Status & roadmap

This is a **public-interest demonstration** built on a **curated sample dataset** covering a handful
of well-known companies and individuals. Figures are approximate and illustrative — the point is to
prove out the structure and the source-first model. **Always confirm current numbers at the linked
source.**

A production version would:
- Pull live from public APIs and bulk datasets (SEC EDGAR full-text + financial statement data sets,
  OpenSecrets / FEC bulk data, Violation Tracker, OpenCorporates) instead of hand-curated JSON.
- Auto-generate daily fact cards from fresh filings.
- Add cross-links between people and the companies they control, and "common ownership" views across
  competitors in an industry.
- Support international registries (e.g. Companies House UK, the German Transparenzregister /
  Bundesanzeiger, North Data) for non-U.S. coverage.
