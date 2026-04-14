// data-processor.js

// ==== UTILIDADES BÃƒ SICAS ====
export function uid() { return 'id-' + Math.random().toString(36).slice(2, 10) }
export function clone(v) { return JSON.parse(JSON.stringify(v)) }
export function emptyDiscardStats() { return { empty: 0, state: 0, missing: 0, details: [] } }
export function todayISO() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}` }
export function currentMonth() { return todayISO().slice(0, 7) }
export function monthFromDate(v) { return String(v || '').slice(0, 7) }

export function normalizeStr(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeMedName(s) {
  if (!s) return "";
  let n = String(s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  n = n.replace(/ECOTOMOGRAFIA|ECOGRAFIA|ECO/g, 'ECO');
  n = n.replace(/TRANSVAGINAL|T\.V\.|ENDOVAGINAL/g, 'TV');
  n = n.replace(/PELVICA|PELVIANA/g, 'PELVICA');
  n = n.replace(/DOPPLER|DOPLER/g, 'DOPPLER');
  return n.replace(/\s+/g, ' ').trim();
}

// ==== CONSTANTES Y REGLAS ====
export const DEFAULT_MAP = { estado: 'Estado', paciente: 'Paciente / Social', examen: 'Examen o # Examenes lab.', fecha: 'fecha' };

export const DEFAULT_RULES_N1 = [
  // 1. Doppler Específicos (Deben leerse primero que los generales para no crear falsos positivos)
  { id: uid(), aliases: 'VASOS TESTICULARES|DOPPLER ABDOMINAL|DOPPLER TESTICULAR', label: 'Eco Doppler Abdominal / Vasos Testiculares', base: 64960 },
  { id: uid(), aliases: 'VASOS PLACENTARIOS|DOPPLER PLACENTARIO|DOPPLER OBSTETRICO', label: 'Eco Doppler Vasos Placentarios', base: 63040 },
  { id: uid(), aliases: 'VASCULAR PERIFERICA|ARTERIAL Y VENOSA|DOPPLER VASCULAR|DOPPLER PERIFERICO|DOPPLER VENOSO|DOPPLER ARTERIAL|DOPPLER EXTREMIDADES', label: 'Eco Doppler Vascular Periférica (Bilateral)', base: 63040 },
  { id: uid(), aliases: 'TRANSCRANEANA|DOPPLER TRANSCRANEANO', label: 'Eco Doppler Transcraneana', base: 63040 },
  { id: uid(), aliases: 'VASOS DEL CUELLO|DOPPLER CUELLO|CAROTIDEO|CAROTIDEA|DOPPLER CAROTIDEO', label: 'Eco Doppler Vasos del Cuello', base: 59530 },
  
  // 2. Ecos de Alta Especificidad Abdominal (antes que la genérica Abdominal)
  { id: uid(), aliases: 'ABDOMINAL Y PELVIANA|ABDOMINAL.*PELVICA|ABDOMINAL.*PELVIANA|ABDOMEN.*PELVIS|ABDOMEN.*PELVIANA', label: 'Eco Abdominal y Pélvica', base: 27570 }, 

  // 3. Seguimientos
  { id: uid(), aliases: 'SEGUIMIENTO DE OVULACION TRANSVAGINAL|SEGUIMIENTO OVULACION TRANSVAGINAL', label: 'Eco Seguim. Ovulación Transvaginal', base: 21410 },
  { id: uid(), aliases: 'SEGUIMIENTO DE OVULACION|SEGUIMIENTO OVULACION', label: 'Eco Seguimiento Ovulación', base: 23980 },
  
  // 4. Exámenes Específicos Top
  { id: uid(), aliases: 'ESTUDIO FETAL|GINECOLOGICA.*OBSTETRICA|PELVIANA.*OBSTETRICA', label: 'Eco Ginecológica/Obst. con Estudio Fetal', base: 14670 },
  { id: uid(), aliases: 'OCULAR|OJO', label: 'Eco Ocular (Bi o Unilateral)', base: 22290 },
  { id: uid(), aliases: 'ENCEFALICA|ENCEFALO|CEREBRAL', label: 'Eco Encefálica (RN o Lactante)', base: 20630 },
  { id: uid(), aliases: 'MAMARIA|MAMAS', label: 'Eco Mamaria Bilateral (incluye Doppler)', base: 19210 },
  { id: uid(), aliases: 'TIROIDEA|TIROIDES|CUELLO TIROIDES', label: 'Eco Tiroidea', base: 19210 },
  { id: uid(), aliases: 'PARTES BLANDAS|MUSCULOESQUELETICA|ARTICULAR|HOMBRO|RODILLA|CODO|TOBILLO|MUÑECA|PIE|MANO|CADERA|MUSCULAR', label: 'Eco Partes Blandas / MSK', base: 19210 },
  { id: uid(), aliases: 'RENAL|BAZO', label: 'Eco Renal / Bazo', base: 19110 },
  
  // 5. Abdominal pura
  { id: uid(), aliases: 'ABDOMINAL|ABDOMEN', label: 'Eco Abdominal', base: 27570 },
  
  // 6. Pélvicas / Urológicas
  { id: uid(), aliases: 'PELVICA MASCULINA|PELVIANA MASCULINA|VEJIGA Y PROSTATA|PROSTATA', label: 'Eco Pélvica Masculina', base: 15330 },
  { id: uid(), aliases: 'TESTICULAR|TESTICULOS|ESCROTAL', label: 'Eco Testicular (incluye Doppler)', base: 18960 },
  
  // 7. Ginecológicas y Generales (Recomendado tener de último para evitar false-matches)
  { id: uid(), aliases: 'TRANSVAGINAL|TRANSRECTAL', label: 'Eco Transvaginal / Transrectal', base: 15400 },
  { id: uid(), aliases: 'GINECOLOGICA|PELVIANA FEMENINA|PELVICA FEMENINA|PELVICA', label: 'Eco Ginecológica / Pelviana', base: 14670 },
  { id: uid(), aliases: 'OBSTETRICA|OBSTÉTRICA', label: 'Eco Obstétrica', base: 8730 },
  { id: uid(), aliases: 'APOYO A CIRUGIA|APOYO A PROCEDIMIENTO|ECOGRAFIA INTRAOPERATORIA', label: 'Eco Apoyo Cirugía', base: 17040 }
];


export const arancelFonasa2026 = {
  "ECOGRAFIA OBSTETRICA": { nivel1: 8730, nivel2: 11350 },
  "ECOGRAFIA ABDOMINAL (INCLUYE HIGADO, VIA BILIAR, VESICULA, PANCREAS, RIÑONES, BAZO, RETROPERITONEO Y GRANDES VASOS)": { nivel1: 27570, nivel2: 35840 },
  "ECOGRAFIA GINECOLOGICA, PELVIANA FEMENINA U OBSTETRICA CON ESTUDIO FETAL": { nivel1: 14670, nivel2: 19070 },
  "ECOGRAFIA PELVICA MASCULINA (INCLUYE VEJIGA Y PROSTATA)": { nivel1: 15330, nivel2: 19930 },
  "ECOGRAFIA RENAL (BILATERAL), O DE BAZO": { nivel1: 19110, nivel2: 24840 },
  "ECOGRAFIA ENCEFALICA (RN O LACTANTE)": { nivel1: 20630, nivel2: 26820 },
  "ECOGRAFIA MAMARIA BILATERAL (INCLUYE DOPPLER)": { nivel1: 19210, nivel2: 24970 },
  "ECOGRAFIA OCULAR, UNILATERAL O BILATERAL": { nivel1: 22290, nivel2: 28980 },
  "ECOGRAFIA TESTICULAR (UNILATERAL O BILATERAL) (INCLUYE DOPPLER)": { nivel1: 18960, nivel2: 24650 },
  "ECOGRAFIA TIROIDEA (INCLUYE DOPPLER)": { nivel1: 19210, nivel2: 24970 },
  "ECOGRAFIA PARTES BLANDAS O MUSCULOESQUELETICA (CADA ZONA ANATOMICA)": { nivel1: 19210, nivel2: 24970 },
  "ECOGRAFIA VASCULAR (ARTERIAL Y VENOSA) PERIFERICA (BILATERAL)": { nivel1: 63040, nivel2: 81950 },
  "ECOGRAFIA DOPPLER DE VASOS DEL CUELLO": { nivel1: 59530, nivel2: 77390 },
  "ECOGRAFIA TRANSCRANEANA": { nivel1: 63040, nivel2: 81950 },
  "ECOGRAFIA ABDOMINAL O DE VASOS TESTICULARES": { nivel1: 64960, nivel2: 84450 },
  "ECOGRAFIA DOPPLER DE VASOS PLACENTARIOS": { nivel1: 63040, nivel2: 81950 }
};

// ==== ESTADO GLOBAL ====
export let APP_STATE = {
  activeWorkspace: 'medicenter',
  activeSubTab: 'main',
  selectedMonth: currentMonth(),
  medicenter: { settings: { percent: 37, monthlyGoal: 0, workDays: [1, 2, 3, 4, 5, 6], priceRules: clone(DEFAULT_RULES_N1), columnMap: clone(DEFAULT_MAP) }, history: [], currentRows: [], currentSummary: null, currentDiscardStats: emptyDiscardStats(), currentFileName: '' },
  reconciliation: { hisData: null, reportData: null, results: null, fonasaLevel: 1, isNet: false }
};

export const getState = () => APP_STATE[APP_STATE.activeWorkspace];

// ==== LÃƒâ€œGICA DE NEGOCIO ====
export function compileRules(rules) {
  return rules.map(r => ({ ...r, regex: new RegExp(r.aliases, 'i') }));
}

export function resolveExam(name, compiledRules) {
  const match = compiledRules.find(r => r.regex.test(name));
  return match ? { label: match.label, base: match.base, matched: true } : { label: 'Sin tarifa (Revisar Config)', base: 0, matched: false };
}

export function buildSessionSummary(rows, fileName, date, paymentPercent, discardStats) {
  const examStats = {}; let totalBase = 0;
  rows.forEach(r => {
    totalBase += r.base;
    if (!examStats[r.label]) examStats[r.label] = { count: 0, base: 0, payment: 0 };
    examStats[r.label].count += 1; examStats[r.label].base += r.base; examStats[r.label].payment += (r.base * paymentPercent / 100);
  });
  return { id: uid(), fileName, workDate: date, paymentPercent, rows, totalBase, totalRows: rows.length, totalPayment: (totalBase * paymentPercent / 100), discardStats: clone(discardStats), sortedExams: Object.entries(examStats).sort((a,b)=>b[1].payment-a[1].payment).map(e=>({label:e[0], ...e[1]})), unmatchedEntries: rows.filter(r=>!r.matched).reduce((acc, r)=>{ const ex = acc.find(x=>x.label===r.examenRaw); if(ex) ex.count++; else acc.push({label:r.examenRaw, count:1}); return acc; }, []) };
}

export function getEntriesForMonth(month) {
  return (APP_STATE[APP_STATE.activeWorkspace].history || []).filter(e => String(e.workDate || '').slice(0, 7) === month);
}

export function summarizeMonth(entries) {
  const examStats = {}; let totalBase = 0, totalPayment = 0, totalRows = 0;
  entries.forEach(e => {
    totalBase += e.totalBase || 0; totalPayment += e.totalPayment || 0; totalRows += e.totalRows || 0;
    (e.rows || []).forEach(r => {
      if (r.matched) {
        if (!examStats[r.label]) examStats[r.label] = { count: 0, base: 0, payment: 0 };
        const pVal = calcPayment(r.base, e.paymentPercent);
        examStats[r.label].count += 1;
        examStats[r.label].base += (r.base || 0);
        examStats[r.label].payment += pVal;
      }
    });
  });
  return { totalBase, totalPayment, totalRows, sortedExams: Object.entries(examStats).sort((a, b) => b[1].payment - a[1].payment).map(e => ({ label: e[0], count: e[1].count, base: e[1].base, payment: e[1].payment })) };
}

export function projectMonth(totalPayment, dayCount, month) {
  if (!dayCount) return 0;
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const cutoff = month === currentMonth() ? new Date().getDate() : daysInMonth;
  return (totalPayment / dayCount) * cutoff;
}

export function computeMissingDates(entries, month) {
  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const workDays = APP_STATE[APP_STATE.activeWorkspace].settings.workDays || [1, 2, 3, 4, 5, 6];
  const missing = [];
  const logged = new Set(entries.map(e => e.workDate));
  const today = todayISO();

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (dateStr > today) break;
    const dayOfWeek = new Date(year, monthNum - 1, d).getDay();
    if (workDays.includes(dayOfWeek) && !logged.has(dateStr)) missing.push(dateStr);
  }
  return missing;
}

export function sanitizePercent(v, f) { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : f }
export function sanitizeMoney(v, f) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : f }
export function calcPayment(base, percent) { return Math.round((Number(base) || 0) * sanitizePercent(percent, 100) / 100) }

// ==== DICCIONARIO DE MACRO-CATEGORÍAS PARTES BLANDAS ====
const PARTES_BLANDAS_CATEGORIAS = {
  "DE PARTES BLANDAS  MUÑECA DERECHA ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS ANTEBRAZO DERECHO ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS AXILA DERECHA ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS BRAZO DERECHO ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS BRAZO IZQUIERDO ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS CADERA ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS CERVICAL ECOTOMOGRAFIA": "Cabeza y Cuello",
  "DE PARTES BLANDAS CODO DERECHO ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS CODO IZQUIERDO ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS CUELLO ECOTOMOGRAFIA": "Cabeza y Cuello",
  "DE PARTES BLANDAS DEDO (CADA UNO) ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS HOMBRO DERECHO ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS HOMBRO IZQUIERDO ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS INGUINAL ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS MANO DERECHA ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS MANO IZQUIERDA ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS MUÑECA IZQUIERDA ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS MUSLO DERECHO ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS MUSLO IZQUIERDO ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS OTRAS REGIONES ECOTOMOGRAFIA": "Otros",
  "DE PARTES BLANDAS PARED ABDOMINAL ECOTOMOGRAFIA": "Tronco / Abdomen",
  "DE PARTES BLANDAS PIE DERECHO ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS PIE IZQUIERDO ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS PIERNA DERECHA ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS PIERNA IZQUIERDA ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS RODILLA DERECHA ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS RODILLA IZQUIERDA ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS TOBILLO DERECHO ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS TOBILLO IZQUIERDO ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS AXILA IZQUIERDA ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS TALON IZQUIERDO ECOTOMOGRAFIA": "Extremidad Inferior",
  "DE PARTES BLANDAS ANTEBRAZO IZQUIERDO ECOTOMOGRAFIA": "Extremidad Superior",
  "DE PARTES BLANDAS PAROTIDA DERECHA ECOTOMOGRAFIA": "Cabeza y Cuello",
  "DE PARTES BLANDAS PAROTIDA IZQUIERDA ECOTOMOGRAFIA": "Cabeza y Cuello",
  "DE PARTES BLANDAS TALON DERECHO ECOTOMOGRAFIA": "Extremidad Inferior"
};

function getCategoriaPartesBlandas(nombre) {
  // Normalizar: colapsar espacios múltiples, trim, uppercase
  const key = String(nombre).replace(/\s+/g, ' ').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [k, cat] of Object.entries(PARTES_BLANDAS_CATEGORIAS)) {
    const kNorm = k.replace(/\s+/g, ' ').trim().toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (kNorm === key) return cat;
  }
  return null; // No es una prestación de Partes Blandas
}

export function calcularMetricasMensuales(datosParseados) {
  if (!datosParseados || !datosParseados.length) return null;

  const ws    = getState();
  const rules = compileRules(ws.settings.priceRules);
  const examenesMap = {};

  let totalCentro = 0, totalTecnologo = 0, cantidadFilas = 0;

  datosParseados.forEach(fila => {
    const toNum = v => {
      if (!v) return 0;
      if (typeof v === 'number') return v;
      return Number(String(v).replace(/[^0-9.-]+/g, '')) || 0;
    };

    const vc  = toNum(fila.Valor);
    const vt  = toNum(fila.APago);
    const nom = String(fila.Examen || 'Sin Nombre').trim();

    totalCentro    += vc;
    totalTecnologo += vt;
    cantidadFilas  += 1;

    const resolved   = resolveExam(nom, rules);
    const reconocido = !!resolved.matched;

    if (!examenesMap[nom]) {
      examenesMap[nom] = { cantidad: 0, totalValor: 0, totalAPago: 0, reconocido, labelOficial: resolved.label || nom };
    }
    examenesMap[nom].cantidad   += 1;
    examenesMap[nom].totalValor += vc;
    examenesMap[nom].totalAPago += vt;
  });

  const totales = { totalCentro, totalTecnologo, cantidadFilas };

  // Ordenado por frecuencia (para el gráfico de barras)
  const conteoExamenes = Object.entries(examenesMap)
    .map(([nombre, v]) => ({ nombre, ...v }))
    .sort((a, b) => b.cantidad - a.cantidad);

  // Ordenado por monto APago (para la tabla financiera)
  const desgloseExamenes = [...conteoExamenes]
    .sort((a, b) => b.totalAPago - a.totalAPago);

  const examenTop     = conteoExamenes[0] || null;
  const noReconocidos = conteoExamenes.filter(e => !e.reconocido);

  // Agrupación por macro-categoría de Partes Blandas
  const ORDEN_CATEGORIAS = ['Extremidad Superior', 'Extremidad Inferior', 'Cabeza y Cuello', 'Tronco / Abdomen', 'Otros'];
  const categoriasMap = {};
  conteoExamenes.forEach(ex => {
    const cat = getCategoriaPartesBlandas(ex.nombre);
    if (!cat) return;
    if (!categoriasMap[cat]) categoriasMap[cat] = { categoria: cat, cantidad: 0, totalAPago: 0, examenes: [] };
    categoriasMap[cat].cantidad   += ex.cantidad;
    categoriasMap[cat].totalAPago += ex.totalAPago;
    categoriasMap[cat].examenes.push({ nombre: ex.nombre, cantidad: ex.cantidad, totalAPago: ex.totalAPago });
  });
  const categoriasPB = ORDEN_CATEGORIAS
    .filter(c => categoriasMap[c])
    .map(c => categoriasMap[c]);

  return { totales, conteoExamenes, desgloseExamenes, examenTop, noReconocidos, categoriasPB };
}
