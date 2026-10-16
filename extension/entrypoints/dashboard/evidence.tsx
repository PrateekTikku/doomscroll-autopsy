import { useState } from 'preact/hooks';
import { loadEvidence, type EvidenceReport } from '@/lib/ml/evidence';
import { hostOf } from '@/lib/ml/names';

const pct = (x: number | null) => (x == null ? 'n/a' : `${Math.round(x * 100)}%`);
const num = (x: number | null) => (x == null ? 'n/a' : x.toFixed(2));

/** Dev-mode evidence view (M3 task 7, PDD 9.10): one domain, many territories; domain-only baseline. */
export function Evidence() {
  const [report, setReport] = useState<EvidenceReport | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setReport(await loadEvidence());
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'doomscroll-m3-evidence.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section class="card" id="evidence">
      <h2>Evidence: domains vs territories</h2>
      <p class="muted">
        Compares grouping by domain with grouping by territory on the same vectors. The JSON lists domains and path names with counts
        only (no titles or text); read it before using it in the post.
      </p>
      <div class="row">
        <button onClick={run} disabled={busy}>
          {busy ? 'Computing…' : 'Compute evidence'}
        </button>
        <button onClick={download} disabled={!report}>
          Download evidence JSON
        </button>
      </div>
      {report && (
        <div>
          <p>
            {report.samples} items · {report.origins} domains · {report.territories} territories.
            <br />
            Silhouette by domain <strong>{num(report.silhouetteByDomain)}</strong> vs by territory{' '}
            <strong>{num(report.silhouetteByTerritory)}</strong> (territories are fitted to these vectors, so this is partly by
            construction).
            <br />
            {report.originsSplit} domains span 2+ territories; a domain-only view hides {pct(report.hiddenByDomainShare)} of their items
            behind the biggest group.
          </p>
          {report.examples.map((ex) => (
            <div key={ex.origin}>
              <strong>{hostOf(ex.origin)}</strong> splits into {ex.territories.length} territories
              {ex.labelsDiffer ? ' with different labels' : ''}; path agreement (NMI) {num(ex.pathAgreementNmi)}
              <table>
                <tbody>
                  {ex.territories.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.name} <span class="muted">({t.label ?? (t.suggestedLabel ? `${t.suggestedLabel}?` : 'unlabelled')})</span>
                      </td>
                      <td class="muted">{t.topPaths.map((p) => `/${p.segment} ${p.count}`).join(' · ')}</td>
                      <td>
                        {t.samples} ({pct(t.share)})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {report.examples.length === 0 && <p class="warn">No domain spans two territories yet. That is a real result: report it as it is.</p>}
        </div>
      )}
    </section>
  );
}
