// ui.js
import { APP_STATE, getState, currentMonth, todayISO, getEntriesForMonth, summarizeMonth, projectMonth, computeMissingDates, sanitizePercent, sanitizeMoney, calcPayment } from './data-processor.js';

// Cache de elementos frecuentes
export const elements = {
  zone: document.getElementById('upload-zone'),
  fileInput: document.getElementById('file-input'),
  workDateInput: document.getElementById('work-date'),
  percentInput: document.getElementById('payment-percent'),
  monthSelectorInput: document.getElementById('month-selector'),
  uploadFeedback: document.getElementById('upload-feedback'),
  wsTitle: document.getElementById('ws-title'),
  wsBadge: document.getElementById('ws-badge'),
  toastContainer: document.getElementById('toast-container'),
  loader: document.getElementById('cloud-loading')
};

let chartInstance = null;

// ==== RENDERIZADO PRINCIPAL ====
export function renderAll() {
  renderCurrentSummary();
  renderMonthlyOverview();
  renderDiscards();
  renderHistory();
}

export function renderCurrentSummary() {
  const ws = getState();
  const s = ws.currentSummary;
  const tbody = document.getElementById('daily-detail-tbody');
  const banner = document.getElementById('unmatched-banner');
  const searchInput = document.getElementById('daily-search').value.toLowerCase().trim();

  document.getElementById('daily-title-display').textContent = 'Resumen: ' + (elements.workDateInput.value ? prettyDate(elements.workDateInput.value) : 'Hoy');

  if (!s) {
    setText('daily-patients', '0');
    setText('daily-base', '$0');
    setText('daily-payment', '$0');
    setText('daily-top-exam', '-');
    setText('daily-payment-copy', `Aplica ${formatPercent(sanitizePercent(elements.percentInput.value, ws.settings.percent))}`);
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty">Carga un archivo para procesar este día.</div></td></tr>`;
    banner.style.display = 'none';
    return;
  }

  const p = sanitizePercent(elements.percentInput.value, ws.settings.percent);
  const dyn = s.totalBase * p / 100;
  const top = s.sortedExams[0];

  setText('daily-patients', String(s.rows.length));
  setText('daily-base', fmtCLP(s.totalBase));
  setText('daily-payment', fmtCLP(dyn));
  setText('daily-top-exam', top ? top.label : '-');
  setText('daily-payment-copy', `Archivo: ${s.fileName}`);

  if (s.rows.length) {
    let displayRows = s.rows;
    if (searchInput) displayRows = displayRows.filter(r => r.paciente.toLowerCase().includes(searchInput) || r.examenRaw.toLowerCase().includes(searchInput) || r.label.toLowerCase().includes(searchInput));
    if (displayRows.length > 0) tbody.innerHTML = displayRows.map(r => `<tr><td>${escapeHtml(r.paciente)}</td><td>${escapeHtml(r.examenRaw)}</td><td>${escapeHtml(r.label)}</td><td>${fmtCLP(calcPayment(r.base, p))}</td></tr>`).join('');
    else tbody.innerHTML = `<tr><td colspan="4"><div class="empty">No hay resultados.</div></td></tr>`;
  } else {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty">No hay pacientes válidos.</div></td></tr>`;
  }

  if (s.unmatchedEntries && s.unmatchedEntries.length) {
    banner.style.display = 'block';
    document.getElementById('unmatched-count').textContent = s.unmatchedEntries.reduce((acc, e) => acc + e.count, 0);
  } else {
    banner.style.display = 'none';
  }
}

export function renderMonthlyOverview() {
  const ws = getState();
  const month = APP_STATE.selectedMonth || currentMonth();
  const entries = getEntriesForMonth(month);
  const totals = summarizeMonth(entries);
  const goal = sanitizeMoney(ws.settings.monthlyGoal, 0);
  const projection = projectMonth(totals.totalPayment, entries.length, month);

  // KPI row in Historial (dynamic, populated by renderMonthlyOverview)
  const kpiRow = document.getElementById('month-kpi-row');
  if (kpiRow) {
    kpiRow.innerHTML = `
      <div class="metric">
        <div class="metric-label">Ganancia Acumulada</div>
        <div class="metric-value" style="color:var(--teal);">${fmtCLP(totals.totalPayment)}</div>
        <div class="metric-sub">${goal > 0 ? 'Meta: ' + fmtCLP(goal) : 'Bruto: ' + fmtCLP(totals.totalBase)}</div>
      </div>
      <div class="metric amber">
        <div class="metric-label">Días trabajados</div>
        <div class="metric-value">${entries.length}</div>
        <div class="metric-sub">Promedio: ${fmtCLP(entries.length ? totals.totalPayment / entries.length : 0)} /día</div>
      </div>
      <div class="metric ink">
        <div class="metric-label">Proyección Fin de Mes</div>
        <div class="metric-value">${fmtCLP(projection)}</div>
        <div class="metric-sub">${goal > 0 && goal > totals.totalPayment ? 'Faltan ' + fmtCLP(goal - totals.totalPayment) : 'Proyección fin de mes'}</div>
      </div>
    `;
  }

  setText('month-days-chip', `${entries.length} día(s)`);

  if (elements.wsBadge) {
    const progress = goal > 0 ? Math.min(100, Math.round((totals.totalPayment / goal) * 100)) : 0;
    elements.wsBadge.textContent = `Meta: ${progress}%`;
  }

  renderMonthChart(totals.sortedExams);
  renderMissingDays(entries, month);

  const breakdownTbody = document.getElementById('month-breakdown-tbody');
  if (!totals.sortedExams.length) {
    breakdownTbody.innerHTML = `<tr><td colspan="3"><div class="empty">Sin datos financieros este mes.</div></td></tr>`;
  } else {
    breakdownTbody.innerHTML = totals.sortedExams.map(ex => `<tr><td>${escapeHtml(ex.label)}</td><td>${ex.count}</td><td style="color:var(--teal); font-weight:600;">${fmtCLP(ex.payment)}</td></tr>`).join('');
  }
}

export function renderMonthChart(sortedExams) {
  const chartEl = document.getElementById('month-chart');
  if (!chartEl) return;
  const top = sortedExams.slice(0, 6);
  const colors = ['#0d7c6e', '#12998a', '#0a5f55', '#17b49d', '#c9820a', '#f0a62e'];
  
  // Verificación robusta: previene el error "Canvas is already in use" consultando el DOM directamente
  const existingChart = Chart.getChart(chartEl);
  if (existingChart) existingChart.destroy();
  if (chartInstance) chartInstance.destroy(); // Fallback de la variable local

  chartInstance = new Chart(chartEl, {
    type: 'bar',
    data: {
      labels: top.map(i => i.label.substring(0, 12) + '.'),
      datasets: [{ data: top.map(i => i.payment), backgroundColor: colors }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { family: 'DM Sans', size: 10 } } },
        y: { ticks: { font: { family: 'DM Mono', size: 10 } } }
      }
    }
  });
}

export function renderDiscards() {
  const ws = getState();
  const s = ws.currentDiscardStats;
  if (!s) return;
  setText('discard-chip', `${s.state + s.missing + s.empty} descartadas`);
  setText('discard-state', String(s.state));
  setText('discard-missing', String(s.missing));
  setText('discard-empty', String(s.empty));

  const tbody = document.getElementById('discard-tbody');
  if (!s.details.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty">No hay descartes en el último archivo.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = s.details.map(i => `<tr><td>${i.rowNumber}</td><td><span class="pill warn">${escapeHtml(i.reason)}</span></td><td>${escapeHtml(i.estado || '-')}</td><td>${escapeHtml(i.paciente || '-')}</td><td>${escapeHtml(i.examenRaw || '-')}</td></tr>`).join('');
}

export function renderHistory() {
  const tbody = document.getElementById('history-tbody');
  const entries = getEntriesForMonth(APP_STATE.selectedMonth);
  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty">No hay días guardados este mes.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = entries.slice().sort((a, b) => b.workDate.localeCompare(a.workDate)).map(e => `
    <tr>
      <td>${prettyDate(e.workDate)}</td>
      <td>${escapeHtml(e.fileName)}</td>
      <td>${e.totalRows}</td>
      <td>${fmtCLP(e.totalPayment)}</td>
      <td style="display:flex; gap:0.3rem;">
        <button class="btn-ghost" data-action="load-history" data-id="${e.id}">Ver</button>
        <button class=”btn-danger” data-action=”delete-history” data-id=”${e.id}”>🗑️</button>
      </td>
    </tr>
  `).join('');
}

export function renderMissingDays(entries, month) {
  const list = document.getElementById('missing-days-list');
  const missing = computeMissingDates(entries, month);
  if (!entries.length) {
    list.innerHTML = `<div class="empty">Carga un día para ver faltantes.</div>`;
    return;
  }
  list.innerHTML = missing.length ? missing.map(prettyDate).join(', ') : 'Todo al día según tu horario.';
}

export function renderConfig() {
  const ws = APP_STATE.medicenter;
  
  document.getElementById('settings-default-percent').value = ws.settings.percent;
  document.getElementById('settings-month-goal').value = ws.settings.monthlyGoal || 0;
  document.getElementById('map-estado').value = ws.settings.columnMap.estado || 'estado';
  document.getElementById('map-paciente').value = ws.settings.columnMap.paciente || 'paciente';
  document.getElementById('map-examen').value = ws.settings.columnMap.examen || 'examen';
  document.getElementById('map-fecha').value = ws.settings.columnMap.fecha || 'fecha';

  document.querySelectorAll('.wd-chk').forEach(chk => {
    chk.checked = (ws.settings.workDays || [1, 2, 3, 4, 5, 6]).includes(Number(chk.value));
  });

  renderRules(ws);
}

export function renderRules(ws) {
  const c = document.getElementById('rules-container');
  const rules = ws.settings.priceRules;
  if (!rules.length) {
    c.innerHTML = `<div class="empty">Sin reglas.</div>`;
    return;
  }
  c.innerHTML = rules.map(r => `
    <div class="rule" data-rule-id="${r.id}">
      <div class="rule-grid">
        <div class="field"><label>Variantes</label><input type="text" data-field="aliases" value="${escapeAttribute(r.aliases)}" /></div>
        <div class="field"><label>Categoría</label><input type="text" data-field="label" value="${escapeAttribute(r.label)}" /></div>
        <div class="field"><label>Valor base ($)</label><input type="number" min="0" step="10" data-field="base" value="${Number(r.base) || 0}" /></div>
        <button class="btn-danger" type="button" data-action="remove-rule" data-id="${r.id}">Eliminar</button>
      </div>
    </div>
  `).join('') + `<div class="row"><button class="btn" type="button" data-action="save-rules">Guardar Reglas</button></div>`;
}

export function renderReconciliation() {
  const r = APP_STATE.reconciliation.results;
  if (!r) return;

  document.getElementById('recon-dashboard').style.display = 'block';
  const sum = (arr, key) => arr.reduce((s, x) => s + (x[key] || 0), 0);

  setText('recon-total-ok', fmtCLP(sum(r.ok, 'pagado')));
  setText('recon-count-ok', `${r.ok.length} registros`);
  setText('recon-total-diff', fmtCLP(Math.abs(sum(r.diff, 'diff'))));
  setText('recon-count-diff', `${r.diff.length} registros`);
  setText('recon-total-leak', `${r.leak.length} fugas`);
  setText('recon-count-leak', 'Atenciones no pagadas');
  setText('recon-total-extra', fmtCLP(sum(r.extra, 'pagado')));
  setText('recon-count-extra', `${r.extra.length} registros`);

  filterReconTable('all');
}

export function filterReconTable(filter) {
  const r = APP_STATE.reconciliation.results;
  const tbody = document.getElementById('recon-tbody');
  if (!r || !tbody) return;

  let data = [];
  if (filter === 'all') data = [...r.ok, ...r.diff, ...r.leak, ...r.extra];
  else if (filter === 'leak') data = r.leak;
  else if (filter === 'diff') data = r.diff;

  tbody.innerHTML = data.map(i => {
    let statusClass = "pill value";
    let statusText = "OK";
    if (r.leak.includes(i)) { statusClass = "pill warn"; statusText = "FUGA"; }
    else if (r.diff.includes(i)) { statusClass = "pill warn"; statusText = "DIFERENCIA"; }
    else if (r.extra.includes(i)) { statusClass = "pill zero"; statusText = "EXCEDENTE"; }

    return `<tr>
      <td><span class="${statusClass}">${statusText}</span></td>
      <td>${escapeHtml(i.paciente)}</td>
      <td>${escapeHtml(i.examen)}</td>
      <td>${escapeHtml(i.financiador)}</td>
      <td>${fmtCLP(i.esperado || 0)}</td>
      <td>${fmtCLP(i.pagado || 0)}</td>
      <td style="font-weight:bold; color:${(i.diff || 0) < -100 ? 'var(--red)' : 'inherit'}">${fmtCLP(i.diff || 0)}</td>
    </tr>`;
  }).join('');
}

// ==== UTILIDADES UI ====
export function showToast(msg, type = "ok") {
  const c = elements.toastContainer;
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast`;
  t.style.backgroundColor = type === 'error' ? 'var(--red)' : (type === 'warn' ? 'var(--amber)' : 'var(--teal)');
  t.innerHTML = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

export function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

export function closeModal() {
  document.getElementById('confirm-modal').style.display = 'none';
}

// ==== NAVEGACIÓN ====
export function switchWorkspace(workspace) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const targetNav = document.getElementById('nav-' + workspace);
  if (targetNav) targetNav.classList.add('active');

  const header = document.getElementById('workspace-header');
  const subnav = document.getElementById('subnav');

  // Ocultamiento estricto: Iteramos sobre TODAS las secciones principales
  document.querySelectorAll('.view-section').forEach(el => {
    el.classList.remove('active');
    el.style.display = 'none'; // ocultamiento forzado
  });

  if (workspace === 'config') {
    if (header) header.style.display = 'none';
    if (subnav) subnav.style.display = 'none';
    
    // Mostramos SÓLO Configuración
    const vConfig = document.getElementById('view-config');
    if (vConfig) {
      vConfig.classList.add('active');
      vConfig.style.display = 'block';
    }
    
    const cSelect = document.getElementById('config-center-select');
    if (cSelect) cSelect.value = APP_STATE.activeWorkspace;
    renderConfig();
  } else if (workspace === 'reconciliation') {
    if (header) header.style.display = 'none';
    if (subnav) subnav.style.display = 'none';
    
    // Mostramos SÓLO Conciliación
    const vRecon = document.getElementById('view-reconciliation');
    if (vRecon) {
      vRecon.classList.add('active');
      vRecon.style.display = 'block';
    }
  } else {
    // Centro activo (solo MediCenter)
    if (header) header.style.display = 'flex';
    if (subnav) subnav.style.display = 'flex';
    
    APP_STATE.activeWorkspace = 'medicenter';
    if (elements.wsTitle) elements.wsTitle.textContent = 'MediCenter';
    
    const wsData = APP_STATE.medicenter;
    if (elements.percentInput) elements.percentInput.value = wsData.settings.percent;
    if (elements.workDateInput) elements.workDateInput.value = wsData.currentSummary ? wsData.currentSummary.workDate : todayISO();
    
    renderAll();
    switchSubTab(APP_STATE.activeSubTab);
  }
}

export function switchSubTab(tabId) {
  APP_STATE.activeSubTab = tabId;
  
  // Ocultamiento estricto
  document.querySelectorAll('.view-section').forEach(el => {
    el.classList.remove('active');
    el.style.display = 'none'; // forzamos ocultos
  });
  document.querySelectorAll('.btn-subnav').forEach(el => el.classList.remove('active'));
  
  const vTarget = document.getElementById('view-' + tabId);
  const sTarget = document.getElementById('subnav-' + tabId);
  
  // Mostramos el target elegido de la subpestaña
  if (vTarget) {
    vTarget.classList.add('active');
    vTarget.style.display = 'block';
  }
  if (sTarget) sTarget.classList.add('active');
  
  if (tabId === 'history') renderMonthlyOverview();
}

// Alias para compatibilidad con main.js
export function renderMetricasMensuales(metricas) { renderDashboardMensual(metricas); }

export function renderDashboardMensual(metricas) {
  try {
    if (!metricas) { console.warn('renderDashboardMensual: sin datos'); return; }

    const fmt = v => '$' + Math.round(Number(v) || 0).toLocaleString('es-CL');

    // Normalizar shape
    const totales          = metricas.totales || { totalCentro: 0, totalTecnologo: 0, cantidadFilas: 0 };
    const conteoExamenes   = Array.isArray(metricas.conteoExamenes) ? metricas.conteoExamenes : [];
    const desgloseExamenes = Array.isArray(metricas.desgloseExamenes) ? metricas.desgloseExamenes : conteoExamenes;
    const examenTop        = metricas.examenTop || conteoExamenes[0] || null;
    const noReconocidos    = Array.isArray(metricas.noReconocidos) ? metricas.noReconocidos : [];

    // ── 1. MOSTRAR EL PANEL MAC ──────────────────────────────────────────────
    const macDashboard = document.getElementById('mac-dashboard');
    if (macDashboard) macDashboard.style.display = 'block';

    // ── 2. TARJETAS RESUMEN (Examen Top + totales) ───────────────────────────
    const summaryCards = document.getElementById('mac-summary-cards');
    if (summaryCards) {
      summaryCards.innerHTML = `
        <div class="metric" style="background:var(--teal-soft); border:1px solid var(--teal);">
          <div class="metric-label" style="color:var(--teal); font-weight:600;">Examen Más Realizado</div>
          <div class="metric-value" style="color:var(--teal); font-size:1.1rem; line-height:1.2;">${examenTop ? escapeHtml(examenTop.nombre.length > 24 ? examenTop.nombre.substring(0, 23) + '…' : examenTop.nombre) : '-'}</div>
          <div class="metric-sub">${examenTop ? examenTop.cantidad + ' veces' : 'Sin datos'}</div>
        </div>
        <div class="metric amber">
          <div class="metric-label">Total Prestaciones</div>
          <div class="metric-value">${totales.cantidadFilas}</div>
          <div class="metric-sub">Filas en el archivo</div>
        </div>
        <div class="metric ink">
          <div class="metric-label">Ingreso Total Centro</div>
          <div class="metric-value">${fmt(totales.totalCentro)}</div>
          <div class="metric-sub">Valor Fonasa</div>
        </div>
        <div class="metric ${noReconocidos.length > 0 ? 'burnt' : ''}" style="${noReconocidos.length === 0 ? 'background:#fff; border:1px solid #e5e7eb;' : ''}">
          <div class="metric-label" style="${noReconocidos.length > 0 ? 'color:var(--red);' : ''}">Alertas de Mapeo</div>
          <div class="metric-value" style="${noReconocidos.length > 0 ? 'color:var(--red);' : ''}">${noReconocidos.length}</div>
          <div class="metric-sub">Prestaciones no mapeadas</div>
        </div>
      `;
    }

    // ── 3. TABLA MACRO-CATEGORÍAS PARTES BLANDAS ────────────────────────────
    const categoriasCard  = document.getElementById('mac-categorias-card');
    const categoriasTbody = document.getElementById('mac-categorias-tbody');
    const categoriasPB    = Array.isArray(metricas.categoriasPB) ? metricas.categoriasPB : [];

    const ICONO_CAT = {
      'Extremidad Superior': '💪',
      'Extremidad Inferior': '🦵',
      'Cabeza y Cuello':     '🫁',
      'Tronco / Abdomen':    '🫀',
      'Otros':               '📌'
    };

    if (categoriasPB.length > 0) {
      if (categoriasCard) categoriasCard.style.display = 'block';
      if (categoriasTbody) {
        const totalCat = categoriasPB.reduce((s, c) => s + c.cantidad, 0);
        categoriasTbody.innerHTML = categoriasPB.map((c, i) => {
          const pct = totalCat > 0 ? Math.round(c.cantidad / totalCat * 100) : 0;
          const detalleId = `cat-detalle-${i}`;
          const examenesOrdenados = [...c.examenes].sort((a, b) => b.cantidad - a.cantidad);
          const filaDetalle = examenesOrdenados.map(ex => `
            <tr style="background:#f8fffe;">
              <td style="padding-left:2.5rem; font-size:0.82rem; color:#374151;">${escapeHtml(ex.nombre)}</td>
              <td style="text-align:center; font-size:0.82rem; color:#374151;">${ex.cantidad}</td>
              <td style="text-align:right; font-size:0.82rem; color:var(--teal);">${fmt(ex.totalAPago)}</td>
            </tr>`).join('');
          return `
            <tr class="cat-header-row" data-target="${detalleId}"
                style="cursor:pointer; user-select:none;"
                title="Toca para ver los exámenes">
              <td>${ICONO_CAT[c.categoria] || ''} <strong>${escapeHtml(c.categoria)}</strong>
                <span class="cat-arrow" style="margin-left:.5rem; font-size:.75em; color:#69707a;">▶</span>
              </td>
              <td style="text-align:center; font-weight:600;">${c.cantidad} <span style="font-size:.75em; color:#69707a;">(${pct}%)</span></td>
              <td style="text-align:right; color:var(--teal); font-weight:600;">${fmt(c.totalAPago)}</td>
            </tr>
            <tr id="${detalleId}" style="display:none;">
              <td colspan="3" style="padding:0;">
                <table style="width:100%; border-collapse:collapse;">
                  <thead>
                    <tr style="background:#e6f7f5;">
                      <th style="padding:.4rem .75rem; font-size:.75rem; text-align:left; color:var(--teal);">Examen específico</th>
                      <th style="padding:.4rem .75rem; font-size:.75rem; text-align:center; color:var(--teal);">Cant.</th>
                      <th style="padding:.4rem .75rem; font-size:.75rem; text-align:right; color:var(--teal);">A Pago</th>
                    </tr>
                  </thead>
                  <tbody>${filaDetalle}</tbody>
                </table>
              </td>
            </tr>`;
        }).join('');

        // Toggle al hacer clic en la fila de categoría
        categoriasTbody.querySelectorAll('.cat-header-row').forEach(row => {
          row.addEventListener('click', () => {
            const target = document.getElementById(row.dataset.target);
            const arrow  = row.querySelector('.cat-arrow');
            if (!target) return;
            const open = target.style.display !== 'none';
            target.style.display = open ? 'none' : 'table-row';
            if (arrow) arrow.textContent = open ? '▶' : '▼';
          });
        });
      }
    } else {
      if (categoriasCard) categoriasCard.style.display = 'none';
    }

    // ── 5. TABLA PRESTACIONES (Prestación | Cantidad | Dinero a Pago) ────────
    const prestTbody = document.getElementById('mac-prestaciones-tbody');
    if (prestTbody) {
      if (desgloseExamenes.length) {
        prestTbody.innerHTML = desgloseExamenes.map(ex => `<tr>
          <td>${escapeHtml(ex.nombre)}${ex.reconocido === false ? ' <span style="color:var(--red);font-size:.75em;" title="Sin mapeo en diccionario">⚠️</span>' : ''}</td>
          <td style="text-align:center; font-weight:600;">${ex.cantidad}</td>
          <td style="color:var(--teal); font-weight:600;">${fmt(ex.totalAPago)}</td>
        </tr>`).join('');
      } else {
        prestTbody.innerHTML = `<tr><td colspan="3"><div class="empty">Sin datos de prestaciones.</div></td></tr>`;
      }
    }

    // ── 6. REDIRIGIR AUTOMÁTICAMENTE A CONCILIACIÓN ──────────────────────────
    switchWorkspace('reconciliation');

  } catch (err) {
    console.error('renderDashboardMensual falló:', err);
  }
}

// ==== HELPERS INTERNOS ====
function fmtCLP(v) { return '$' + Math.round(Number(v) || 0).toLocaleString('es-CL'); }
function formatPercent(v) { return `${Number(v).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`; }
function prettyDate(s) { if (!s) return '-'; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }); }
function escapeHtml(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttribute(v) { return String(v || '').replace(/"/g, '&quot;'); }
