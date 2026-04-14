// main.js
import { auth, db } from './firebase-config.js';
import { loginEmail, registerEmail, logout, initAuth, CURRENT_USER, DOC_REF } from './auth.js';
import { 
  APP_STATE, getState, clone, uid, emptyDiscardStats, currentMonth, todayISO, monthFromDate, 
  sanitizePercent, sanitizeMoney, compileRules, resolveExam, buildSessionSummary, 
  projectMonth, summarizeMonth, getEntriesForMonth, DEFAULT_RULES_N1, 
  DEFAULT_MAP, arancelFonasa2026, normalizeStr, normalizeMedName, calcularMetricasMensuales
} from './data-processor.js';
import { 
  elements, renderAll, renderCurrentSummary, renderMonthlyOverview, renderDiscards, 
  renderHistory, renderConfig, renderRules, renderReconciliation, showToast, 
  switchWorkspace, switchSubTab, closeModal, filterReconTable, 
  renderMetricasMensuales, renderDashboardMensual
} from './ui.js';

// ==== INICIALIZACIÓN ====
document.addEventListener('DOMContentLoaded', () => {
  const loader = document.getElementById('cloud-loading');
  const loginScreen = document.getElementById('login-screen');
  const appLayout = document.getElementById('app-layout');

  // ── Listeners del formulario de login (deben estar activos ANTES del login) ──
  const errEl = document.getElementById('login-error');

  function showLoginError(msg) {
    if (errEl) errEl.textContent = msg;
  }

  function clearLoginError() {
    if (errEl) errEl.textContent = '';
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      clearLoginError();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const btn = document.getElementById('login-submit-btn');

      if (!email) { showLoginError('Ingresa tu correo electrónico.'); return; }
      if (password.length < 6) { showLoginError('La contraseña debe tener al menos 6 caracteres.'); return; }

      btn.disabled = true;
      btn.textContent = 'Ingresando...';
      try {
        await loginEmail(email, password);
      } catch (err) {
        showLoginError(translateAuthError(err.code));
        btn.disabled = false;
        btn.textContent = 'Iniciar sesión';
      }
    });
  }

  const registerBtn = document.getElementById('register-btn');
  if (registerBtn) {
    registerBtn.addEventListener('click', async (e) => {
      // Evitar que el evento burbujee al form y dispare loginEmail() por submit
      e.preventDefault();
      e.stopPropagation();

      clearLoginError();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      if (!email) { showLoginError('Ingresa tu correo electrónico.'); return; }
      if (password.length < 6) { showLoginError('La contraseña debe tener al menos 6 caracteres.'); return; }

      registerBtn.disabled = true;
      registerBtn.textContent = 'Creando cuenta...';
      try {
        await registerEmail(email, password);
        // onAuthStateChanged detecta el nuevo usuario y redirige al dashboard
      } catch (err) {
        showLoginError(translateAuthError(err.code));
        registerBtn.disabled = false;
        registerBtn.textContent = 'Crear cuenta';
      }
    });
  }

  // ── Observer de estado de autenticación ──
  initAuth(
    async (user) => {
      if (loginScreen) loginScreen.style.display = 'none';
      if (appLayout) appLayout.style.display = 'flex';
      const avatar = document.getElementById('user-avatar');
      if (avatar) avatar.src = user.photoURL || '';
      await hydrateData();
    },
    () => {
      if (loader) loader.style.display = 'none';
      if (appLayout) appLayout.style.display = 'none';
      if (loginScreen) loginScreen.style.display = 'flex';
    }
  );
});

async function hydrateData() {
  const retryBtn = document.getElementById('retry-btn');
  const failTimer = setTimeout(() => {
    if (retryBtn) retryBtn.style.display = 'inline-flex';
    showToast("Firebase no responde. Posible problema de red.", "error");
  }, 5000);

  try {
    const docSnap = await DOC_REF.get();
    if (docSnap.exists) {
      const saved = docSnap.data();
      if (saved.medicenter) APP_STATE.medicenter = saved.medicenter;
    }

    // Asegurar estructura
    if (!APP_STATE.medicenter.settings.columnMap) APP_STATE.medicenter.settings.columnMap = clone(DEFAULT_MAP);

  } catch (error) {
    console.error("Error conectando a Firebase:", error);
    showToast("Trabajando sin conexión profunda.", "error");
  }

  clearTimeout(failTimer);
  if (elements.loader) elements.loader.style.display = 'none';

  APP_STATE.selectedMonth = currentMonth();
  if (elements.monthSelectorInput) elements.monthSelectorInput.value = APP_STATE.selectedMonth;
  
  switchWorkspace('medicenter');
  bindEvents();
}

async function persist() {
  if (!CURRENT_USER) return;
  try {
    const cleanData = JSON.parse(JSON.stringify({ medicenter: APP_STATE.medicenter }));
    await DOC_REF.set(cleanData);
  } catch (error) {
    console.error("Error guardando en la nube:", error);
  }
}

// ==== GESTIÓN DE EVENTOS ====
function bindEvents() {
  // Navegación Sidebar
  document.getElementById('nav-medicenter').addEventListener('click', () => switchWorkspace('medicenter'));
  document.getElementById('nav-reconciliation').addEventListener('click', () => switchWorkspace('reconciliation'));
  document.getElementById('nav-config').addEventListener('click', () => switchWorkspace('config'));

  // Navegación SubTabs
  document.getElementById('subnav-main').addEventListener('click', () => switchSubTab('main'));
  document.getElementById('subnav-history').addEventListener('click', () => switchSubTab('history'));
  document.getElementById('subnav-reconciliation').addEventListener('click', () => switchSubTab('reconciliation'));
  document.getElementById('subnav-control').addEventListener('click', () => switchSubTab('control'));

  // Auth – logout (login/register están en DOMContentLoaded)
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  const logoutInactiveBtn = document.getElementById('logout-inactive-btn');
  if (logoutInactiveBtn) logoutInactiveBtn.addEventListener('click', logout);

  // Carga de Archivos
  elements.zone.addEventListener('dragover', e => { e.preventDefault(); elements.zone.classList.add('drag-over'); });
  elements.zone.addEventListener('dragleave', () => elements.zone.classList.remove('drag-over'));
  elements.zone.addEventListener('drop', e => { 
    e.preventDefault(); 
    elements.zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); 
  });
  elements.fileInput.addEventListener('change', e => { 
    if (e.target.files[0]) {
      processFile(e.target.files[0]);
      e.target.value = '';
    }
  });

  // Controles de fecha y porcentaje
  elements.workDateInput.addEventListener('change', loadDataForCurrentDate);
  document.getElementById('prev-day-btn').addEventListener('click', () => changeDay(-1));
  document.getElementById('next-day-btn').addEventListener('click', () => changeDay(1));
  elements.percentInput.addEventListener('input', () => { 
    const v = sanitizePercent(elements.percentInput.value, getState().settings.percent); 
    elements.percentInput.value = v; 
    renderCurrentSummary(); 
  });

  // Historial
  elements.monthSelectorInput.addEventListener('change', () => { 
    APP_STATE.selectedMonth = elements.monthSelectorInput.value || currentMonth(); 
    renderMonthlyOverview(); 
    renderHistory(); 
  });
  document.getElementById('export-pdf-btn').addEventListener('click', exportMonthlyPDF);
  document.getElementById('export-month-xlsx-btn').addEventListener('click', exportMonthXlsxDetail);
  document.getElementById('confirm-delete-month-btn').addEventListener('click', confirmDeleteMonth);
  document.getElementById('confirm-yes-btn').addEventListener('click', () => {
    if (window.pendingDeleteAction) window.pendingDeleteAction();
  });
  const cancelBtn = document.getElementById('confirm-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) retryBtn.addEventListener('click', () => location.reload());

  // Configuración
  document.getElementById('save-settings-btn').addEventListener('click', saveSettingsFromPanel);
  document.getElementById('add-rule-btn').addEventListener('click', addRuleCard);
  document.getElementById('restore-defaults-btn').addEventListener('click', restoreDefaultRules);
  document.getElementById('settings-month-goal').addEventListener('input', () => { 
    if (APP_STATE.activeSubTab === 'history') renderMonthlyOverview(); 
  });

  // Conciliación
  document.getElementById('recon-fonasa-level').addEventListener('change', runReconciliation);
  document.getElementById('recon-tax-type').addEventListener('change', runReconciliation);
  document.getElementById('input-his').addEventListener('change', e => {
    processReconFile(e.target, 'his');
    e.target.value = '';
  });
  document.getElementById('input-report').addEventListener('change', e => {
    processReconFile(e.target, 'report');
    e.target.value = '';
  });
  document.getElementById('save-recon-report-btn').addEventListener('click', saveReconciliationReport);
  
  // Filtros Conciliación
  document.getElementById('filter-recon-all').addEventListener('click', () => filterReconTable('all'));
  document.getElementById('filter-recon-leak').addEventListener('click', () => filterReconTable('leak'));
  document.getElementById('filter-recon-diff').addEventListener('click', () => filterReconTable('diff'));

  // Delegación de eventos para tablas dinámicas
  document.addEventListener('click', e => {
    const action = e.target.dataset.action;
    const id = e.target.dataset.id;
    if (action === 'load-history') loadHistoryEntry(id);
    if (action === 'delete-history') deleteHistoryEntry(id);
    if (action === 'remove-rule') removeRule(id);
    if (action === 'save-rules') saveRules();
  });

  // Botón "Borrar datos del día"
  const clearDayBtn = document.getElementById('clear-day-btn');
  if (clearDayBtn) {
    clearDayBtn.addEventListener('click', () => {
      const ws = getState();
      ws.currentSummary = null;
      ws.currentDiscardStats = emptyDiscardStats();
      elements.workDateInput.value = todayISO();
      elements.percentInput.value = ws.settings.percent;
      renderAll();
      showToast('Datos del día borrados. Listo para nuevo archivo.');
    });
  }
}

// ==== LÓGICA DE ACCIONES ====
function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    Papa.parse(file, { skipEmptyLines: false, complete: r => handleMatrix(r.data, file.name) });
  } else if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = e => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      handleMatrix(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }), file.name);
    };
    reader.readAsArrayBuffer(file);
  }
}

function handleMatrix(matrix, fileName) {
  try {
    const ws = getState();
    const map = ws.settings.columnMap;

    // -- 1. AUTO-DETECCIÓN DE TIPO DE ARCHIVO --
    let isMonthly = false;
    let isDaily = false;
    let headerIndex = 0;
    let headersRaw = [];
    let headersNormalized = [];

    const limit = Math.min(matrix.length, 15);
    const targetP = normalizeStr(map.paciente);
    const targetE = normalizeStr(map.examen);

    for (let i = 0; i < limit; i++) {
      const rowRaw = matrix[i] || [];
      const rowNorm = rowRaw.map(normalizeStr);
      
      // Fírma del archivo MENSUAL: "APago", "Valor", o "Financiador"
      if (rowNorm.some(c => c.includes('apago')) || rowNorm.some(c => c.includes('valor')) || rowNorm.some(c => c.includes('financiador'))) {
        isMonthly = true;
        headerIndex = i;
        headersRaw = rowRaw;
        headersNormalized = rowNorm;
        break;
      }
      
      // Fírma del archivo DIARIO
      if (rowNorm.some(c => c.includes(targetP)) && rowNorm.some(c => c.includes(targetE))) {
        isDaily = true;
        headerIndex = i;
        headersRaw = rowRaw;
        headersNormalized = rowNorm;
        break;
      }
    }

    // -- 2. RUTEO: LÓGICA TIPO_MENSUAL --
    if (isMonthly) {
      console.log("1. Archivo recibido: " + fileName);
      console.log("2. Encabezados detectados: ", headersRaw);
      console.log("3. Enrutamiento: Procesando como MENSUAL");

      const originalHeaders = headersRaw.map(h => String(h || '').trim());
      const objList = matrix.slice(headerIndex + 1)
        .filter(row => row && row.some(c => String(c || '').trim() !== ''))
        .map(row => {
          let obj = {};
          originalHeaders.forEach((h, idx) => { if (h) obj[h] = row[idx]; });
          return obj;
        });

      if (!Array.isArray(objList) || objList.length === 0) {
        throw new Error("Datos vacíos o archivo sin formato reconocible.");
      }

      const metricasLiquidacion = calcularMetricasMensuales(objList);
      console.log("4. Métricas calculadas: ", metricasLiquidacion);
      
      APP_STATE.reconciliation.reportData = matrix;
      const reportStatus = document.getElementById('status-report');
      if (reportStatus) {
        reportStatus.style.display = 'inline-block';
        reportStatus.textContent = fileName;
      }
      
      renderDashboardMensual(metricasLiquidacion);
      switchWorkspace('reconciliation');
      showToast("Liquidación Mensual → Conciliación.");
      return;
    }

    // -- 3. RUTEO: LÓGICA TIPO_DIARIO --
    console.log("1. Archivo recibido: " + fileName);
    console.log("2. Encabezados detectados: ", headersRaw);
    console.log("3. Enrutamiento: Procesando como DIARIO");

    if (!isDaily) {
      throw new Error("Columnas irreconocibles. No es un archivo diario ni mensual válido.");
    }

    const tEst = normalizeStr(map.estado);
    const idx = {
      estado: headersNormalized.findIndex(h => h.includes(tEst)),
      paciente: headersNormalized.findIndex(h => h.includes(targetP)),
      examen: headersNormalized.findIndex(h => h.includes(targetE))
    };

    if (idx.estado === -1 || idx.paciente === -1 || idx.examen === -1) {
      throw new Error("Faltan columnas obligatorias (Estado, Paciente o Examen) para el reporte diario.");
    }

    const processed = [];
    let disc = emptyDiscardStats();
    const rules = compileRules(ws.settings.priceRules);

    matrix.slice(headerIndex + 1).forEach((row, i) => {
      if (!row || !row.some(c => String(c || '').trim() !== '')) { disc.empty++; return; }
      if (!row[idx.paciente] || !row[idx.examen]) { disc.missing++; return; }

      const estadoLimpio = normalizeStr(row[idx.estado]);
      if (!estadoLimpio.includes('fin de atencion')) {
        disc.state++;
        disc.details.push({ rowNumber: headerIndex + i + 2, reason: 'No finalizado', paciente: row[idx.paciente], examenRaw: row[idx.examen], estado: row[idx.estado] });
        return;
      }

      const resolved = resolveExam(String(row[idx.examen]).trim(), rules);
      processed.push({ paciente: String(row[idx.paciente]).trim(), examenRaw: String(row[idx.examen]).trim(), ...resolved });
    });

    const p = sanitizePercent(elements.percentInput.value, ws.settings.percent);
    let summary = buildSessionSummary(processed, fileName, elements.workDateInput.value, p, disc);

    const duplicate = ws.history.find(e => e.workDate === summary.workDate);
    if (duplicate) {
      if (window.confirm("¿Sumar estos registros al día existente?")) {
        summary = buildSessionSummary([...duplicate.rows, ...processed], duplicate.fileName + ' + ' + fileName, summary.workDate, p, disc);
      }
      ws.history = ws.history.filter(e => e.id !== duplicate.id);
    }

    ws.history.push(summary);
    ws.currentSummary = summary;
    ws.currentDiscardStats = summary.discardStats;
    persist(); renderAll(); showToast("Archivo Diario procesado con éxito.");
  } catch (error) {
    console.error("Fallo crítico:", error);
    showToast("Error procesando: " + error.message, "error");
  }
}

function loadDataForCurrentDate() {
  const date = elements.workDateInput.value;
  const ws = getState();
  const entry = ws.history.find(e => e.workDate === date);
  if (entry) {
    ws.currentSummary = entry;
    elements.percentInput.value = entry.paymentPercent;
  } else {
    ws.currentSummary = null;
    elements.percentInput.value = ws.settings.percent;
  }
  renderAll();
}

function changeDay(offset) {
  const current = elements.workDateInput.value || todayISO();
  const d = new Date(current + 'T12:00:00');
  d.setDate(d.getDate() + offset);
  elements.workDateInput.value = d.toISOString().split('T')[0];
  loadDataForCurrentDate();
}

// Config y Reglas
async function saveSettingsFromPanel() {
  const ws = getState();
  ws.settings.percent = sanitizePercent(document.getElementById('settings-default-percent').value, 100);
  ws.settings.monthlyGoal = sanitizeMoney(document.getElementById('settings-month-goal').value, 0);
  ws.settings.workDays = Array.from(document.querySelectorAll('.wd-chk:checked')).map(c => Number(c.value));
  ws.settings.columnMap = {
    estado: document.getElementById('map-estado').value.trim(),
    paciente: document.getElementById('map-paciente').value.trim(),
    examen: document.getElementById('map-examen').value.trim(),
    fecha: document.getElementById('map-fecha').value.trim()
  };
  await persist(); showToast("Ajustes guardados.");
}

function addRuleCard() { getState().settings.priceRules.push({ id: uid(), aliases: '', label: 'Nuevo', base: 0 }); renderRules(getState()); }
function removeRule(id) { const ws = getState(); ws.settings.priceRules = ws.settings.priceRules.filter(r => r.id !== id); renderRules(ws); }
async function saveRules() {
  const ws = getState();
  const cards = Array.from(document.querySelectorAll('[data-rule-id]'));
  ws.settings.priceRules = cards.map(c => ({
    id: c.dataset.ruleId,
    aliases: c.querySelector('[data-field="aliases"]').value.trim(),
    label: c.querySelector('[data-field="label"]').value.trim(),
    base: sanitizeMoney(c.querySelector('[data-field="base"]').value, 0)
  })).filter(r => r.aliases && r.label);
  await persist(); renderRules(ws); showToast("Diccionario actualizado.");
}

async function restoreDefaultRules() {
  const ws = getState();
  ws.settings.priceRules = clone(DEFAULT_RULES_N1);
  await persist(); renderRules(ws); showToast("Reglas restauradas.");
}

// Historial
function loadHistoryEntry(id) {
  const entry = getState().history.find(e => e.id === id);
  if (entry) {
    elements.workDateInput.value = entry.workDate;
    loadDataForCurrentDate();
    switchSubTab('main');
  }
}

async function deleteHistoryEntry(id) {
  if (!confirm("¿Borrar este registro?")) return;
  const ws = getState();
  ws.history = ws.history.filter(e => e.id !== id);
  if (ws.currentSummary && ws.currentSummary.id === id) ws.currentSummary = null;
  await persist(); renderAll(); showToast("Registro eliminado.");
}

function confirmDeleteMonth() {
  const month = APP_STATE.selectedMonth;
  document.getElementById('confirm-text').textContent = `Se borrará todo el mes ${month}.`;
  document.getElementById('confirm-modal').style.display = 'flex';
  window.pendingDeleteAction = async () => {
    const ws = getState();
    ws.history = ws.history.filter(e => monthFromDate(e.workDate) !== month);
    await persist(); renderAll(); closeModal(); showToast("Mes eliminado.");
  };
}

// Exportación
async function exportMonthlyPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const target = document.getElementById('pdf-export-area');
  const canvas = await html2canvas(target, { scale: 2 });
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 15, 40, 180, 120);
  doc.save(`Reporte_${APP_STATE.activeWorkspace}_${APP_STATE.selectedMonth}.pdf`);
}

function exportMonthXlsxDetail() {
  const entries = getEntriesForMonth(APP_STATE.selectedMonth);
  const rows = [];
  entries.forEach(e => e.rows.forEach(r => rows.push({ Fecha: e.workDate, Paciente: r.paciente, Examen: r.examenRaw, Pago: r.base })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Detalle');
  XLSX.writeFile(wb, `EcoMetricas_${APP_STATE.activeWorkspace}_${APP_STATE.selectedMonth}.xlsx`);
}

// Conciliación
function processReconFile(input, type) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  const handle = data => {
    try {
      APP_STATE.reconciliation[type + 'Data'] = data;
      document.getElementById('status-' + type).style.display = 'inline-block';
      document.getElementById('status-' + type).textContent = file.name;
      
      // Si es el archivo de liquidación (reporte), calculamos sus métricas
      if (type === 'report') {
        // Helper local: array de arrays -> array de objetos buscando la fila de headers
        let headerIdx = 0;
        for (let i = 0; i < Math.min(data.length, 5); i++) {
          if (data[i] && data[i].some(v => String(v).toLowerCase().includes('examen') || String(v).toLowerCase().includes('valor'))) {
            headerIdx = i; break;
          }
        }
        const headers = data[headerIdx].map(h => String(h || '').trim());
        const objList = data.slice(headerIdx + 1)
          .filter(row => row && row.some(c => String(c || '').trim() !== ''))
          .map(row => {
            let obj = {};
            headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
            return obj;
          });

        const metricasLiquidacion = calcularMetricasMensuales(objList);
        renderDashboardMensual(metricasLiquidacion);
      }
      
      if (APP_STATE.reconciliation.hisData && APP_STATE.reconciliation.reportData) runReconciliation();
    } catch (e) {
      console.error("Error en processReconFile:", e);
      showToast("Fallo crítico procesando conciliación: " + e.message, "error");
    }
  };
  if (ext === 'csv') Papa.parse(file, { skipEmptyLines: true, complete: r => handle(r.data) });
  else {
    const reader = new FileReader();
    reader.onload = e => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      handle(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }));
    };
    reader.readAsArrayBuffer(file);
  }
}

function runReconciliation() {
  const { hisData, reportData } = APP_STATE.reconciliation;
  const level = document.getElementById('recon-fonasa-level').value;
  const profit = getState().settings.percent;
  const factor = document.getElementById('recon-tax-type').value === 'neto' ? 0.8625 : 1.0;

  // Lógica simplificada para el módulo main
  const hisMap = {};
  hisData.slice(1).forEach(row => {
    if (!normalizeStr(row[2] || '').includes('fin de atencion')) return;
    const key = normalizeMedName(row[1]) + '|' + normalizeMedName(row[0]);
    hisMap[key] = (hisMap[key] || 0) + 1;
  });

  const results = { ok: [], diff: [], leak: [], extra: [] };
  reportData.slice(1).forEach(row => {
    const key = normalizeMedName(row[0]) + '|' + normalizeMedName(row[1]);
    const record = { paciente: row[0], examen: row[1], financiador: row[2], pagado: Number(row[4]), esperado: Number(row[4]), diff: 0 };
    if (hisMap[key]) {
      hisMap[key]--;
      results.ok.push(record);
    } else results.extra.push(record);
  });

  APP_STATE.reconciliation.results = results;
  renderReconciliation();
}

async function saveReconciliationReport() {
  const r = APP_STATE.reconciliation.results;
  try {
    await db.collection("users").doc(CURRENT_USER.uid).collection("recon_history").add({
      date: todayISO(),
      total: r.ok.length
    });
    showToast("Reporte guardado.");
  } catch (e) { showToast("Error al guardar.", "error"); }
}

// ==== UTILIDAD AUTH ====
function translateAuthError(code) {
  const map = {
    'auth/invalid-email':          'El correo no tiene un formato válido.',
    'auth/user-not-found':         'No existe una cuenta con ese correo.',
    'auth/wrong-password':         'Contraseña incorrecta.',
    'auth/invalid-credential':     'Correo o contraseña incorrectos.',
    'auth/email-already-in-use':   'Ese correo ya tiene una cuenta. Inicia sesión.',
    'auth/weak-password':          'La contraseña debe tener al menos 6 caracteres.',
    'auth/too-many-requests':      'Demasiados intentos fallidos. Espera unos minutos.',
    'auth/network-request-failed': 'Sin conexión. Verifica tu red e intenta de nuevo.',
    'auth/operation-not-allowed':  'El registro con email/contraseña no está habilitado. Actívalo en Firebase Console → Authentication → Sign-in methods.',
  };
  return map[code] || `Error (${code}). Intenta de nuevo.`;
}
