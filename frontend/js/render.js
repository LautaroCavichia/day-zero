/**
 * render.js — Pure rendering functions. No state, no fetching.
 *
 * Exports:
 *   renderDeliveryScores(scores)
 *   renderDeckCritique(critique)
 *   renderMarketIntel(intel)
 *   renderDebateRounds(rounds, container)
 *   renderVerdict(verdict)
 *   renderSources(sources)
 *   confidenceBadge(value)   — returns HTML string
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

export function confidenceBadge(val) {
  if (val >= 0.7) return '<span class="badge badge-high">High</span>';
  if (val >= 0.4) return '<span class="badge badge-medium">Medium</span>';
  return '<span class="badge badge-low">Low</span>';
}

function pct(val, max = 1) {
  return Math.round((val || 0) / max * 100);
}

function bar(label, val, max, color) {
  const p = pct(val, max);
  return `
    <div class="score-row">
      <div class="score-label"><span>${label}</span><strong>${typeof val === 'number' ? val.toFixed(max === 1 ? 2 : 1) : val}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${color}"></div></div>
    </div>`;
}

function barColor(val, max = 10) {
  const r = val / max;
  if (r >= 0.7) return '#38a169';
  if (r >= 0.5) return '#dd6b20';
  return '#e53e3e';
}

// ── Delivery Scores ───────────────────────────────────────────────────────────

export function renderDeliveryScores(scores) {
  const el = document.getElementById('delivery-scores-content');
  if (!el || !scores) return;

  el.innerHTML = `
    ${bar('Confidence',  scores.confidence,  1, barColor(scores.confidence, 1))}
    ${bar('Specificity', scores.specificity, 1, barColor(scores.specificity, 1))}
    ${bar('Energy',      scores.energy,      1, barColor(scores.energy, 1))}
    <div class="score-row">
      <div class="score-label"><span>Hesitation count</span>
        <strong style="color:${scores.hesitation_count > 10 ? '#e53e3e' : scores.hesitation_count > 4 ? '#dd6b20' : '#38a169'}">
          ${scores.hesitation_count}
        </strong>
      </div>
    </div>
  `;
  document.getElementById('delivery-scores-card').classList.remove('hidden');
}

// ── Deck Critique ─────────────────────────────────────────────────────────────

export function renderDeckCritique(critique) {
  const el = document.getElementById('deck-critique-content');
  if (!el || !critique) return;

  let html = `
    <div class="two-col">
      <div class="stat-box">Narrative Arc<br><strong>${critique.narrative_arc_score}/10</strong></div>
      <div class="stat-box">Visual Clarity<br><strong>${critique.visual_clarity_score}/10</strong></div>
    </div>`;

  if (critique.overall_summary) {
    html += `<p class="summary-text">${critique.overall_summary}</p>`;
  }

  if (critique.top_issues?.length) {
    html += '<h4 class="section-label danger">Top Issues</h4><ul class="plain-list">';
    critique.top_issues.forEach(i => html += `<li>${i}</li>`);
    html += '</ul>';
  }

  if (critique.strengths?.length) {
    html += '<h4 class="section-label success">Strengths</h4><ul class="plain-list">';
    critique.strengths.forEach(s => html += `<li>${s}</li>`);
    html += '</ul>';
  }

  if (critique.missing_slides?.length) {
    html += '<h4 class="section-label warning">Missing Slides</h4><ul class="plain-list">';
    critique.missing_slides.forEach(m => html += `<li>${m}</li>`);
    html += '</ul>';
  }

  if (critique.slides?.length) {
    html += '<h4 class="section-label">Slide-by-Slide</h4><div class="slide-grid">';
    critique.slides.forEach(slide => {
      const c = barColor(slide.score);
      html += `
        <div class="slide-card" style="border-left-color:${c}">
          <div class="slide-header">
            <span>Slide ${slide.index}: ${slide.title || 'Untitled'}</span>
            <span class="score-pill" style="background:${c}">${slide.score}/10</span>
          </div>
          <p>${slide.critique}</p>
        </div>`;
    });
    html += '</div>';
  }

  el.innerHTML = html;
  document.getElementById('deck-critique-card').classList.remove('hidden');
}

// ── Market Intel ──────────────────────────────────────────────────────────────

export function renderMarketIntel(intel) {
  const el = document.getElementById('market-intel-content');
  if (!el || !intel) return;

  let html = '';

  if (intel.competitors?.length) {
    html += '<h4 class="section-label">Competitors</h4>';
    intel.competitors.forEach(c => {
      html += `
        <div class="competitor-card">
          <strong>${c.name}</strong> ${confidenceBadge(c.confidence)}
          <p>${c.description}</p>
          <small>Funding: ${c.funding}</small>
          ${c.source_url ? `<br><a href="${c.source_url}" target="_blank">Source</a>` : ''}
        </div>`;
    });
  }

  if (intel.market_size) {
    const ms = intel.market_size;
    html += `
      <h4 class="section-label">Market Size ${confidenceBadge(ms.confidence)}</h4>
      <div class="two-col">
        <div class="stat-box">TAM<br><strong>${ms.tam || '—'}</strong></div>
        <div class="stat-box">SAM<br><strong>${ms.sam || '—'}</strong></div>
        <div class="stat-box">SOM<br><strong>${ms.som || '—'}</strong></div>
      </div>
      ${ms.analyst_note ? `<p class="summary-text">${ms.analyst_note}</p>` : ''}`;
  }

  if (intel.why_now) {
    const wn = intel.why_now;
    if (wn.tailwinds?.length) {
      html += '<h4 class="section-label success">Tailwinds</h4><ul class="plain-list">';
      wn.tailwinds.forEach(t => html += `<li>${t}</li>`);
      html += '</ul>';
    }
    if (wn.headwinds?.length) {
      html += '<h4 class="section-label danger">Headwinds</h4><ul class="plain-list">';
      wn.headwinds.forEach(h => html += `<li>${h}</li>`);
      html += '</ul>';
    }
  }

  if (intel.pivot_suggestions?.length) {
    html += '<h4 class="section-label">Pivot Suggestions</h4>';
    intel.pivot_suggestions.forEach(p => {
      html += `
        <div class="pivot-card">
          <strong>${p.suggestion}</strong> ${confidenceBadge(p.confidence)}
          <p>${p.rationale}</p>
          <small>Precedent: ${p.precedent_company}</small>
          ${p.source_url ? `<br><a href="${p.source_url}" target="_blank">Source</a>` : ''}
        </div>`;
    });
  }

  el.innerHTML = html;
  document.getElementById('market-intel-card').classList.remove('hidden');
}

// ── Debate Rounds ─────────────────────────────────────────────────────────────

export function renderDebateRounds(rounds) {
  const el = document.getElementById('debate-content');
  if (!el || !rounds?.length) return;

  let html = '';
  rounds.forEach(round => {
    html += `<div class="debate-round"><h4>Round ${round.round} of 3</h4>`;

    if (round.skeptic) {
      html += `
        <div class="persona skeptic">
          <div class="persona-name">Paul (Skeptic) <span class="score-pill">${round.skeptic.score}/10</span></div>
          <p>${round.skeptic.dialogue}</p>
        </div>`;
    }
    if (round.optimist) {
      html += `
        <div class="persona optimist">
          <div class="persona-name">Elad (Optimist) <span class="score-pill">${round.optimist.score}/10</span></div>
          <p>${round.optimist.dialogue}</p>
        </div>`;
    }
    if (round.operator) {
      html += `
        <div class="persona operator">
          <div class="persona-name">Keith (Operator) <span class="score-pill">${round.operator.score}/10</span></div>
          <p>${round.operator.dialogue}</p>
        </div>`;
    }

    html += '</div>';
  });

  el.innerHTML = html;
  document.getElementById('deliberation-card').classList.remove('hidden');
}

// ── Final Verdict ─────────────────────────────────────────────────────────────

export function renderVerdict(verdict) {
  const el = document.getElementById('verdict-content');
  if (!el || !verdict) return;

  const decision = verdict.decision || 'NO';
  const score = verdict.weighted_score || 0;
  const badgeClass = decision.toLowerCase().replace(' ', '-');

  let html = `
    <div class="verdict-card">
      <div class="verdict-badge ${badgeClass}">${decision}</div>
      <h3>Investment Decision</h3>
      <div class="score-row" style="margin:16px 0">
        <div class="score-label"><span>Overall Score</span><strong>${score}/100</strong></div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${score}%;background:white"></div>
        </div>
      </div>`;

  if (verdict.score_breakdown) {
    const sb = verdict.score_breakdown;
    const dims = [
      ['Problem Clarity',   sb.problem_clarity,   10],
      ['Market Size',       sb.market_size,        10],
      ['Solution Strength', sb.solution_strength,  10],
      ['Team',              sb.team,               10],
      ['Traction',          sb.traction,           10],
      ['Delivery',          sb.delivery,           10],
    ];
    html += '<h4 style="margin:16px 0 8px">Score Breakdown</h4>';
    dims.forEach(([label, val, max]) => {
      const p = pct(val || 0, max);
      const c = barColor(val || 0, max);
      html += `
        <div class="score-row">
          <div class="score-label"><span>${label}</span><strong>${(val || 0).toFixed(1)}/${max}</strong></div>
          <div class="bar-track" style="background:rgba(255,255,255,0.25)">
            <div class="bar-fill" style="width:${p}%;background:${c}"></div>
          </div>
        </div>`;
    });
  }

  if (verdict.investment_thesis) {
    html += `<p class="thesis-text">${verdict.investment_thesis}</p>`;
  }

  html += '<div class="two-col" style="margin-top:16px">';
  if (verdict.strengths?.length) {
    html += '<div><h4>Strengths</h4><ul class="plain-list">';
    verdict.strengths.forEach(s => html += `<li>${s}</li>`);
    html += '</ul></div>';
  }
  if (verdict.risks?.length) {
    html += '<div><h4>Risks</h4><ul class="plain-list">';
    verdict.risks.forEach(r => html += `<li>${r}</li>`);
    html += '</ul></div>';
  }
  html += '</div>';

  if (verdict.next_steps?.length) {
    html += '<h4 style="margin-top:16px">Next Steps</h4><ul class="plain-list">';
    verdict.next_steps.forEach(s => html += `<li>${s}</li>`);
    html += '</ul>';
  }

  if (verdict.recommended_pivot) {
    html += `
      <div class="pivot-card" style="margin-top:16px">
        <h4>Recommended Pivot</h4>
        <p>${verdict.recommended_pivot}</p>
      </div>`;
  }

  html += '</div>';
  el.innerHTML = html;
  document.getElementById('verdict-card').classList.remove('hidden');
}

// ── Sources ───────────────────────────────────────────────────────────────────

export function renderSources(sources) {
  const el = document.getElementById('sources-content');
  if (!el) return;
  if (!sources?.length) {
    el.innerHTML = '<p style="color:#718096">No sources available.</p>';
    document.getElementById('sources-card').classList.remove('hidden');
    return;
  }
  let html = '<ul class="plain-list">';
  sources.forEach(src => {
    const badge = typeof src === 'object' ? confidenceBadge(src.confidence || 0) : '';
    const url = typeof src === 'string' ? src : src.url;
    const claim = typeof src === 'object' ? src.claim : null;
    html += `<li style="margin-bottom:10px">
      ${claim ? `<strong>${claim}</strong> ${badge}<br>` : ''}
      ${url ? `<a href="${url}" target="_blank" style="color:#667eea;font-size:0.9rem">${url}</a>` : url || src}
    </li>`;
  });
  html += '</ul>';
  el.innerHTML = html;
  document.getElementById('sources-card').classList.remove('hidden');
}
