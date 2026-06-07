/* Who Owns What? — source-first transparency reference
 * Vanilla JS single-page app. No build step, no dependencies.
 */

const App = {
  companies: [],
  people: [],
  factcards: { stats: [], cards: [] },
  loaded: false,
};

const el = document.getElementById('app');

/* ---------- Data loading ---------- */
async function loadData() {
  if (App.loaded) return;
  const [companies, people, factcards] = await Promise.all([
    fetch('data/companies.json').then((r) => r.json()),
    fetch('data/people.json').then((r) => r.json()),
    fetch('data/factcards.json').then((r) => r.json()),
  ]);
  App.companies = companies;
  App.people = people;
  App.factcards = factcards;
  App.loaded = true;
}

/* ---------- Helpers ---------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sourceLink(src) {
  if (!src || !src.url) return '';
  return `<a class="source-link" href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.name || 'Source')}</a>`;
}

function sourcesList(sources) {
  if (!sources || !sources.length) return '';
  return `<div class="sources">${sources.map(sourceLink).join('')}</div>`;
}

/* A labeled fact with value, optional meta line, and source(s) */
function factRow(label, value, meta, sources) {
  const metaHtml = meta ? `<div class="fact-meta">${esc(meta)}</div>` : '';
  const srcHtml = sources ? sourcesList(Array.isArray(sources) ? sources : [sources]) : '';
  return `
    <div class="fact-row">
      <div class="fact-label">${esc(label)}</div>
      <div class="fact-value">${value}</div>
      ${metaHtml}
      ${srcHtml}
    </div>`;
}

function setActiveSearch(q) {
  const input = document.getElementById('searchInput');
  if (input && typeof q === 'string') input.value = q;
}

/* ---------- Views ---------- */
function viewDiscover() {
  const { stats, cards } = App.factcards;

  const statsHtml = stats
    .map(
      (s) => `
      <div class="stat-card">
        <div class="stat-value">${esc(s.value)}</div>
        <div class="stat-label">${esc(s.label)}</div>
        <div class="stat-context">${esc(s.context)}</div>
        ${sourceLink(s.source)}
      </div>`
    )
    .join('');

  const cardsHtml = cards
    .map(
      (c) => `
      <article class="fact-card">
        <span class="cat">${esc(c.category)}</span>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.body)}</p>
        ${sourcesList(c.sources)}
      </article>`
    )
    .join('');

  const companyChips = App.companies
    .map((c) => `<a class="entity-card" href="#/company/${esc(c.id)}">
        <span class="kind company">Company</span>
        <h3>${esc(c.name)}</h3>
        <div class="meta">${esc(c.sector)} · ${esc(c.ticker)}</div>
      </a>`)
    .join('');

  const peopleChips = App.people
    .map((p) => `<a class="entity-card" href="#/person/${esc(p.id)}">
        <span class="kind person">Person</span>
        <h3>${esc(p.name)}</h3>
        <div class="meta">${esc(p.title)}</div>
      </a>`)
    .join('');

  el.innerHTML = `
    <section class="hero">
      <h1>Who owns what — and who benefits?</h1>
      <p>Search a company, billionaire, or executive and see ownership, executive pay,
         lobbying, political spending, fines, and labor issues in one place. Every claim
         links back to a primary public source.</p>
      <div class="source-pledge">🔗 Source-first: no unsourced claims, no spin</div>
    </section>

    <section class="section">
      <h2 class="section-title">The big picture</h2>
      <p class="section-sub">Headline numbers on wealth and influence — each linked to its source.</p>
      <div class="stats-grid">${statsHtml}</div>
    </section>

    <section class="section">
      <h2 class="section-title">Daily fact cards</h2>
      <p class="section-sub">Plain-language explainers that turn public records into something readable.</p>
      <div class="cards-grid">${cardsHtml}</div>
    </section>

    <section class="section">
      <h2 class="section-title">Browse companies</h2>
      <p class="section-sub">${App.companies.length} profiles in this sample dataset.</p>
      <div class="entity-grid">${companyChips}</div>
    </section>

    <section class="section">
      <h2 class="section-title">Browse people</h2>
      <p class="section-sub">${App.people.length} profiles in this sample dataset.</p>
      <div class="entity-grid">${peopleChips}</div>
    </section>
  `;
}

function viewSearch(query) {
  setActiveSearch(query);
  const q = (query || '').trim().toLowerCase();

  if (!q) {
    el.innerHTML = `<div class="empty">Type something in the search box above to begin.</div>`;
    return;
  }

  const matchCompanies = App.companies.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.ticker || '').toLowerCase().includes(q) ||
      (c.sector || '').toLowerCase().includes(q) ||
      (c.summary || '').toLowerCase().includes(q)
  );
  const matchPeople = App.people.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      (p.title || '').toLowerCase().includes(q) ||
      (p.companies || []).some((co) => (co.company || '').toLowerCase().includes(q))
  );

  const total = matchCompanies.length + matchPeople.length;

  const companyCards = matchCompanies
    .map((c) => `<a class="entity-card" href="#/company/${esc(c.id)}">
        <span class="kind company">Company</span>
        <h3>${esc(c.name)}</h3>
        <div class="meta">${esc(c.sector)} · ${esc(c.ticker)}</div>
      </a>`)
    .join('');

  const peopleCards = matchPeople
    .map((p) => `<a class="entity-card" href="#/person/${esc(p.id)}">
        <span class="kind person">Person</span>
        <h3>${esc(p.name)}</h3>
        <div class="meta">${esc(p.title)}</div>
      </a>`)
    .join('');

  el.innerHTML = `
    <section class="section">
      <h2 class="section-title">Results for “${esc(query)}”</h2>
      <p class="section-sub">${total} match${total === 1 ? '' : 'es'} in the sample dataset.</p>
      ${
        total === 0
          ? `<div class="empty">No matches yet. This is a curated sample dataset — try
             “Walmart”, “Amazon”, “Apple”, “Buffett”, or “Musk”.</div>`
          : `<div class="entity-grid">${companyCards}${peopleCards}</div>`
      }
    </section>
  `;
}

function viewCompany(id) {
  const c = App.companies.find((x) => x.id === id);
  if (!c) return notFound();

  const shareholders = (c.shareholders || [])
    .map((s) =>
      factRow(s.holder, `<span class="num">${esc(s.stake)}</span>`, null, s.source)
    )
    .join('');

  const fines = (c.fines || [])
    .map((f) =>
      factRow(
        `<span class="badge-warn">⚠ ${esc(f.agency || 'Regulator')}</span>`,
        `${esc(f.description)} <span class="num">(${esc(f.amount)})</span>`,
        f.year ? `As of: ${f.year}` : null,
        f.source
      )
    )
    .join('');

  const labor = (c.labor || [])
    .map((l) => factRow('Labor', esc(l.description), l.year ? `Year: ${l.year}` : null, l.source))
    .join('');

  const timeline = (c.timeline || [])
    .map(
      (t) => `<li>
        <span class="t-date">${esc(t.date)}</span> —
        <span class="t-event">${esc(t.event)}</span>
        ${t.source ? sourcesList([t.source]) : ''}
      </li>`
    )
    .join('');

  el.innerHTML = `
    <div class="profile-header">
      <div>
        <span class="kind company" style="color:var(--accent)">Company</span>
        <h1>${esc(c.name)}</h1>
        <div class="subtitle">${esc(c.sector)} · ${esc(c.ticker)}</div>
        <div class="profile-tags">
          <span class="tag">📍 ${esc(c.headquarters)}</span>
        </div>
      </div>
    </div>

    <p class="profile-summary">${esc(c.summary)}</p>

    <div class="data-block">
      <h2><span class="icon">◧</span> Largest shareholders</h2>
      ${shareholders || '<p class="section-sub">Not available in this dataset.</p>'}
    </div>

    <div class="data-block">
      <h2><span class="icon">$</span> Pay</h2>
      ${factRow(
        `CEO compensation — ${esc(c.ceoPay.name)}`,
        `<span class="num">${esc(c.ceoPay.amount)}</span>`,
        c.ceoPay.year ? `Year: ${c.ceoPay.year}` : null,
        c.ceoPay.source
      )}
      ${factRow(
        'Median employee pay',
        `<span class="num">${esc(c.medianPay.amount)}</span>`,
        c.medianPay.year ? `Year: ${c.medianPay.year}` : null,
        c.medianPay.source
      )}
      ${factRow(
        'CEO-to-worker pay ratio',
        `<span class="num">${esc(c.payRatio.value)}</span>`,
        null,
        c.payRatio.source
      )}
    </div>

    <div class="data-block">
      <h2><span class="icon">⚖</span> Influence</h2>
      ${factRow(
        'Federal lobbying',
        `<span class="num">${esc(c.lobbying.amount)}</span>`,
        c.lobbying.year ? `${c.lobbying.year}` : null,
        c.lobbying.source
      )}
      ${factRow(
        'Political spending',
        esc(c.politicalSpending.amount),
        c.politicalSpending.cycle ? `${c.politicalSpending.cycle}` : null,
        c.politicalSpending.source
      )}
    </div>

    <div class="data-block">
      <h2><span class="icon">⚠</span> Fines &amp; settlements</h2>
      ${fines || '<p class="section-sub">Not available in this dataset.</p>'}
    </div>

    <div class="data-block">
      <h2><span class="icon">✊</span> Labor</h2>
      ${labor || '<p class="section-sub">Not available in this dataset.</p>'}
    </div>

    <div class="data-block">
      <h2><span class="icon">◑</span> Market position</h2>
      ${factRow('Market share', esc(c.marketShare.description), null, c.marketShare.source)}
      ${factRow('Main competitors', esc((c.competitors || []).join(', ')), null, null)}
    </div>

    <div class="data-block">
      <h2><span class="icon">⏱</span> Timeline</h2>
      <ul class="timeline">${timeline}</ul>
    </div>

    <a class="back-link" href="#/">← Back to Discover</a>
  `;
}

function viewPerson(id) {
  const p = App.people.find((x) => x.id === id);
  if (!p) return notFound();

  const companies = (p.companies || [])
    .map((co) => factRow(co.company, esc(co.role), null, co.source))
    .join('');

  const assets = (p.assets || [])
    .map((a) => factRow('Asset', esc(a.description), null, a.source))
    .join('');

  const boards = (p.boards || [])
    .map((b) => factRow('Board / role', esc(b.role), null, b.source))
    .join('');

  const foundations = (p.foundations || [])
    .map((f) => factRow('Foundation', esc(f.name), null, f.source))
    .join('');

  const political = (p.politicalSpending || [])
    .map((x) => factRow('Political spending', esc(x.description), null, x.source))
    .join('');

  const timeline = (p.timeline || [])
    .map(
      (t) => `<li>
        <span class="t-date">${esc(t.date)}</span> —
        <span class="t-event">${esc(t.event)}</span>
        ${t.source ? sourcesList([t.source]) : ''}
      </li>`
    )
    .join('');

  el.innerHTML = `
    <div class="profile-header">
      <div>
        <span class="kind person" style="color:var(--good)">Person</span>
        <h1>${esc(p.name)}</h1>
        <div class="subtitle">${esc(p.title)}</div>
        <div class="profile-tags">
          ${p.citizenship ? `<span class="tag">🛂 ${esc(p.citizenship)}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="data-block">
      <h2><span class="icon">$</span> Net worth</h2>
      ${factRow(
        'Estimated net worth',
        `<span class="num">${esc(p.netWorth.amount)}</span>`,
        p.netWorth.year ? `As of: ${p.netWorth.year}` : null,
        p.netWorth.source
      )}
      <div class="notice">Net-worth figures are third-party estimates and change constantly with
        markets and currency. Treat them as approximate; confirm at the linked source.</div>
    </div>

    <div class="data-block">
      <h2><span class="icon">◧</span> Companies controlled / owned</h2>
      ${companies || '<p class="section-sub">Not available in this dataset.</p>'}
    </div>

    <div class="data-block">
      <h2><span class="icon">◆</span> Major assets</h2>
      ${assets || '<p class="section-sub">Not available in this dataset.</p>'}
    </div>

    <div class="data-block">
      <h2><span class="icon">▦</span> Board memberships</h2>
      ${boards || '<p class="section-sub">Not available in this dataset.</p>'}
    </div>

    <div class="data-block">
      <h2><span class="icon">♥</span> Foundations &amp; philanthropy</h2>
      ${foundations || '<p class="section-sub">Not available in this dataset.</p>'}
    </div>

    <div class="data-block">
      <h2><span class="icon">⚖</span> Political spending</h2>
      ${political || '<p class="section-sub">Not available in this dataset.</p>'}
    </div>

    <div class="data-block">
      <h2><span class="icon">⏱</span> Timeline</h2>
      <ul class="timeline">${timeline}</ul>
    </div>

    <a class="back-link" href="#/">← Back to Discover</a>
  `;
}

function viewAbout() {
  el.innerHTML = `
    <section class="section prose">
      <h1>About Who Owns What?</h1>
      <p>Pieces of this information already exist — scattered across SEC filings, lobbying
         databases, court records, and annual reports, and across excellent specialist sites
         (see <em>Related projects</em> below). The problem is the same one raised in the original
         thread: those sources are <strong>hard reads for the average person</strong> — buried in
         dense reports, confusing menus, and academic language. <strong>Who Owns What?</strong>
         brings the public record together in one <em>readable</em> place, in plain language, with a
         source link on every claim.</p>

      <h2>The rules</h2>
      <ul>
        <li><strong>Everything is sourced.</strong> Every figure links back to a primary public
            record — SEC filings, FEC and OpenSecrets data, court and regulator databases, or
            official company reports.</li>
        <li><strong>No unsourced allegations.</strong> No conspiracy content, no partisan spin.</li>
        <li><strong>Not an investing site.</strong> The goal is to track and explain wealth,
            ownership, and influence — not to give financial advice.</li>
      </ul>

      <h2>What you can look up</h2>
      <ul>
        <li><strong>Companies:</strong> largest shareholders, CEO pay, median employee pay, the
            CEO-to-worker pay ratio, lobbying, political spending, fines and settlements, labor
            disputes, market position, and a timeline.</li>
        <li><strong>People:</strong> net-worth estimates, companies controlled, major assets,
            board memberships, foundations, political spending, and a timeline of major events.</li>
      </ul>

      <h2>Primary sources used</h2>
      <ul>
        <li><a href="https://www.sec.gov/edgar/search/" target="_blank" rel="noopener noreferrer">SEC EDGAR</a> — proxy statements (DEF 14A), 10-Ks, 8-Ks, 13F/13D holdings, pay-ratio disclosures</li>
        <li><a href="https://www.opensecrets.org/" target="_blank" rel="noopener noreferrer">OpenSecrets</a> — lobbying and campaign-finance data</li>
        <li><a href="https://www.fec.gov/data/" target="_blank" rel="noopener noreferrer">FEC</a> — federal campaign contributions</li>
        <li><a href="https://violationtracker.goodjobsfirst.org/" target="_blank" rel="noopener noreferrer">Violation Tracker (Good Jobs First)</a> — regulatory penalties and settlements</li>
        <li><a href="https://www.nlrb.gov/search/case" target="_blank" rel="noopener noreferrer">NLRB</a> — labor cases and union elections</li>
        <li><a href="https://projects.propublica.org/nonprofits/" target="_blank" rel="noopener noreferrer">ProPublica Nonprofit Explorer</a> — foundation Form 990s</li>
        <li><a href="https://www.forbes.com/billionaires/" target="_blank" rel="noopener noreferrer">Forbes</a> — net-worth estimates</li>
      </ul>

      <h2>Related projects (prior art)</h2>
      <p>This idea builds on a lot of excellent existing work. Several of these were suggested in the
         original thread. Each does part of the job well — the gap this fills is bringing it together
         in plain language for a general audience.</p>
      <ul>
        <li><a href="https://www.opensecrets.org/" target="_blank" rel="noopener noreferrer">OpenSecrets</a> — U.S. money in politics (lobbying, campaign finance)</li>
        <li><a href="https://littlesis.org/" target="_blank" rel="noopener noreferrer">LittleSis</a> — networks of power and influence between people and organizations</li>
        <li><a href="https://opencorporates.com/" target="_blank" rel="noopener noreferrer">OpenCorporates</a> — the largest open database of companies worldwide</li>
        <li><a href="https://whalewisdom.com/" target="_blank" rel="noopener noreferrer">WhaleWisdom</a> — institutional-investor holdings from SEC 13F filings</li>
        <li><a href="https://www.macrotrends.net/" target="_blank" rel="noopener noreferrer">Macrotrends</a> — long-run financial metrics, CEO pay, and KPIs</li>
        <li><a href="https://companiesmarketcap.com/" target="_blank" rel="noopener noreferrer">CompaniesMarketCap</a> — market-capitalization rankings</li>
        <li><a href="https://www.northdata.com/" target="_blank" rel="noopener noreferrer">North Data</a> — company networks, shareholdings, and financial statements (esp. Europe)</li>
        <li><a href="https://www.companyhouse.de/" target="_blank" rel="noopener noreferrer">Companyhouse</a> — international company information</li>
        <li><a href="https://www.dnb.com/business-directory.html" target="_blank" rel="noopener noreferrer">Dun &amp; Bradstreet Business Directory</a> — global company directory, corporate family trees, and firmographics</li>
        <li><a href="https://www.transparenzregister.de/" target="_blank" rel="noopener noreferrer">Transparenzregister</a> &amp; <a href="https://www.bundesanzeiger.de/" target="_blank" rel="noopener noreferrer">Bundesanzeiger</a> — Germany's beneficial-ownership register and federal gazette</li>
      </ul>

      <h2>Ethics &amp; privacy</h2>
      <p>A fair point raised in the thread: transparency tools can be abused, and we don't want
         stigmatization or witch hunts. This project is deliberately scoped to limit that risk:</p>
      <ul>
        <li><strong>Public figures and public companies only</strong> — people who hold concentrated
            economic or political power (executives, controlling shareholders, billionaires) and the
            organizations they run. Not private individuals.</li>
        <li><strong>Publicly disclosed data only</strong> — information that companies and officials
            are already legally required to file, or that reputable outlets have published. No private
            addresses, no personal contact details, no leaked or hacked material.</li>
        <li><strong>Facts, not judgments</strong> — the record links to the source and lets readers
            draw their own conclusions. No allegations, no editorializing.</li>
      </ul>

      <h2>About this build</h2>
      <p>This is a public-interest demonstration of the concept, built as a dependency-free static
         web app. It runs on a <strong>curated sample dataset</strong> covering a handful of
         well-known companies and individuals. Figures are approximate and illustrative — the point
         is to show the structure and the source-first model. A production version would pull live
         from the public APIs and bulk data sets listed above and add automated daily fact cards.</p>

      <a class="back-link" href="#/">← Back to Discover</a>
    </section>
  `;
}

function notFound() {
  el.innerHTML = `<div class="empty">Not found. <a href="#/">Return to Discover</a>.</div>`;
}

/* ---------- Router ---------- */
function parseHash() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, queryString] = hash.split('?');
  const params = new URLSearchParams(queryString || '');
  const parts = path.split('/').filter(Boolean); // e.g. ['company','apple']
  return { parts, params };
}

async function router() {
  await loadData();
  const { parts, params } = parseHash();

  window.scrollTo(0, 0);

  if (parts.length === 0) return viewDiscover();

  switch (parts[0]) {
    case 'search':
      return viewSearch(params.get('q') || '');
    case 'company':
      return viewCompany(parts[1]);
    case 'person':
      return viewPerson(parts[1]);
    case 'about':
      return viewAbout();
    default:
      return viewDiscover();
  }
}

/* ---------- Wiring ---------- */
document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = document.getElementById('searchInput').value.trim();
  location.hash = `#/search?q=${encodeURIComponent(q)}`;
});

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
// In case the script loads after DOMContentLoaded has already fired:
if (document.readyState !== 'loading') router();
