/* ==========================================================================
   Consulta · Doña Elena (Endocrinología)
   PWA privada 100% cliente — Diseñada por Sam Lazkano
   ========================================================================== */

(() => {
  'use strict';

  /* Claves exclusivas de preferencias y notas en localStorage (sin datos de pacientes) */
  const STORAGE_KEYS = {
    theme: 'elena_theme',
    favorites: 'elena_favorites',
    notes: 'elena_notes'
  };

  /* Equivalencias antiinflamatorias de corticoides respecto a 5 mg de Prednisona */
  const CORTICOIDES = {
    hidrocortisona: { nombre: 'Hidrocortisona', eq: 20 },
    prednisona: { nombre: 'Prednisona', eq: 5 },
    metilprednisolona: { nombre: 'Metilprednisolona', eq: 4 },
    dexametasona: { nombre: 'Dexametasona', eq: 0.75 },
    deflazacort: { nombre: 'Deflazacort', eq: 6 }
  };

  /* Presentaciones habituales de Levotiroxina (mcg) */
  const LEVO_DOSES = [25, 50, 75, 88, 100, 112, 125, 137, 150, 175, 200];

  /* Estado en memoria */
  let activeTab = 'calculadoras';
  let favorites = loadJSON(STORAGE_KEYS.favorites, []);
  let notes = loadJSON(STORAGE_KEYS.notes, []);
  let editingNoteId = null;
  let levoFactor = 1.6;
  let selectedLevoChip = null;
  let deferredPrompt = null;
  let toastTimer = null;

  /* Orden inicial de cada tarjeta para restaurar al quitar de favoritos */
  const originalOrder = new Map();

  /* ==================== UTILIDADES ==================== */

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Silencioso si el almacenamiento privado bloquea escritura */
    }
  }

  /**
   * Convierte texto con coma o punto decimal en número finito, o NaN si no es válido.
   */
  function parseNum(value) {
    if (typeof value !== 'string') return NaN;
    const cleaned = value.trim().replace(',', '.');
    if (!cleaned) return NaN;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : NaN;
  }

  function fmt(num, decimals = 2) {
    return Number(num.toFixed(decimals)).toString().replace('.', ',');
  }

  /**
   * Normaliza texto quitando acentos/diacríticos para búsqueda instantánea en español.
   */
  function normalizeText(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  }

  /* ==================== TEMA CLARO / OSCURO ==================== */

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', isDark ? '#111715' : '#5B7F6E');
  }

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));

    const btn = document.getElementById('themeToggle');
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try {
        localStorage.setItem(STORAGE_KEYS.theme, next);
      } catch {
        /* Ignorar si storage no disponible */
      }
    });
  }

  /* ==================== NAVEGACIÓN Y BÚSQUEDA ==================== */

  function setActiveTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.tab !== tabName);
    });
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      const isCurrent = btn.dataset.nav === tabName;
      btn.classList.toggle('active', isCurrent);
      if (isCurrent) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });
  }

  function applySearchFilter() {
    const input = document.getElementById('globalSearch');
    const clearBtn = document.getElementById('clearSearchBtn');
    const summary = document.getElementById('searchSummary');
    const countEl = document.getElementById('searchCount');
    const emptyEl = document.getElementById('searchEmptyState');
    const query = normalizeText(input.value.trim());

    clearBtn.classList.toggle('hidden', !query);

    const panels = document.querySelectorAll('.tab-panel');
    const items = document.querySelectorAll('.searchable-item');
    const tabHeaders = document.querySelectorAll('.tab-header');

    if (!query) {
      summary.classList.add('hidden');
      emptyEl.classList.add('hidden');
      tabHeaders.forEach((h) => h.classList.remove('hidden'));
      items.forEach((item) => item.classList.remove('hidden'));
      setActiveTab(activeTab);
      return;
    }

    /* En modo búsqueda mostramos todos los paneles para filtrar entre calculadoras, guías, pautas y notas */
    summary.classList.remove('hidden');
    tabHeaders.forEach((h) => h.classList.add('hidden'));

    let matches = 0;
    panels.forEach((panel) => panel.classList.remove('hidden'));

    items.forEach((item) => {
      const haystack = normalizeText(`${item.dataset.keywords || ''} ${item.textContent}`);
      const isMatch = haystack.includes(query);
      item.classList.toggle('hidden', !isMatch);
      if (isMatch) matches += 1;
    });

    /* Ocultar el formulario de nueva nota durante una búsqueda activa */
    const noteFormCard = document.getElementById('noteForm')?.closest('.card');
    const privacyBanner = document.querySelector('.privacy-banner');
    if (noteFormCard) noteFormCard.classList.add('hidden');
    if (privacyBanner) privacyBanner.classList.add('hidden');

    /* Si limpiamos luego, asegurar que se restauran al salir de búsqueda */
    countEl.textContent = `${matches} ${matches === 1 ? 'resultado' : 'resultados'}`;
    emptyEl.classList.toggle('hidden', matches > 0);
  }

  function restoreNotePanelControls() {
    const noteFormCard = document.getElementById('noteForm')?.closest('.card');
    const privacyBanner = document.querySelector('.privacy-banner');
    if (noteFormCard) noteFormCard.classList.remove('hidden');
    if (privacyBanner) privacyBanner.classList.remove('hidden');
  }

  function initNavigationAndSearch() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const searchInput = document.getElementById('globalSearch');
        if (searchInput.value.trim()) {
          searchInput.value = '';
          restoreNotePanelControls();
          applySearchFilter();
        }
        setActiveTab(btn.dataset.nav);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    const searchInput = document.getElementById('globalSearch');
    const clearBtn = document.getElementById('clearSearchBtn');

    searchInput.addEventListener('input', () => {
      if (!searchInput.value.trim()) restoreNotePanelControls();
      applySearchFilter();
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      restoreNotePanelControls();
      applySearchFilter();
      searchInput.focus();
    });
  }

  /* ==================== FAVORITOS (FIJAR ARRIBA) ==================== */

  function registerOriginalOrders() {
    document.querySelectorAll('.cards-stack').forEach((stack) => {
      Array.from(stack.children).forEach((child, idx) => {
        if (child.dataset.id) {
          originalOrder.set(child.dataset.id, idx);
        }
      });
    });
  }

  function syncFavoritesUI() {
    const favSet = new Set(favorites);
    const stacks = ['calculadorasList', 'guiasList', 'pautasList'];

    stacks.forEach((stackId) => {
      const stack = document.getElementById(stackId);
      if (!stack) return;
      const cards = Array.from(stack.querySelectorAll('.card[data-id]'));

      cards.sort((a, b) => {
        const aFav = favSet.has(a.dataset.id) ? 0 : 1;
        const bFav = favSet.has(b.dataset.id) ? 0 : 1;
        if (aFav !== bFav) return aFav - bFav;
        return (originalOrder.get(a.dataset.id) ?? 0) - (originalOrder.get(b.dataset.id) ?? 0);
      });

      cards.forEach((card) => {
        const isFav = favSet.has(card.dataset.id);
        card.classList.toggle('is-favorite', isFav);
        const btn = card.querySelector('.fav-btn');
        if (btn) {
          btn.classList.toggle('active', isFav);
          btn.textContent = isFav ? '★' : '☆';
          btn.setAttribute('aria-pressed', String(isFav));
        }
        stack.appendChild(card);
      });
    });
  }

  function initFavorites() {
    registerOriginalOrders();
    syncFavoritesUI();

    document.addEventListener('click', (event) => {
      const btn = event.target.closest('.fav-btn');
      if (!btn) return;
      const id = btn.dataset.favId;
      if (!id) return;

      if (favorites.includes(id)) {
        favorites = favorites.filter((item) => item !== id);
        showToast('Quitado de favoritos');
      } else {
        favorites = [...favorites, id];
        showToast('Fijado en favoritos');
      }
      saveJSON(STORAGE_KEYS.favorites, favorites);
      syncFavoritesUI();
    });
  }

  /* ==================== CALCULADORA 1: CALCIO CORREGIDO ==================== */

  function updateCalcio() {
    const ca = parseNum(document.getElementById('ca-medido').value);
    const alb = parseNum(document.getElementById('ca-albumina').value);
    const box = document.getElementById('ca-result');

    if (Number.isNaN(ca) || Number.isNaN(alb) || ca <= 0 || alb <= 0) {
      box.className = 'result-box is-empty';
      box.textContent = 'Introduce calcio y albúmina para calcular.';
      return;
    }

    const corregido = ca + 0.8 * (4 - alb);
    let tagClass = 'tag-ok';
    let label = 'Rango habitual (8.5–10.5)';
    if (corregido < 8.5) {
      tagClass = 'tag-warn';
      label = 'Hipocalcemia (< 8.5)';
    } else if (corregido > 10.5) {
      tagClass = 'tag-alert';
      label = 'Hipercalcemia (> 10.5)';
    }

    const extraNote = alb >= 4
      ? 'Nota: con albúmina ≥ 4.0 g/dL habitualmente no se requiere corrección al alza.'
      : 'Rango orientativo de calcio total: 8.5 – 10.5 mg/dL (confirmar con Ca iónico si dudas).';

    box.className = 'result-box';
    box.innerHTML = `
      <div class="result-main">
        <span class="result-value">${fmt(corregido, 2)} mg/dL</span>
        <span class="result-tag ${tagClass}">${label}</span>
      </div>
      <p class="result-note">${extraNote}</p>
    `;
  }

  /* ==================== CALCULADORA 2: HOMA-IR ==================== */

  function updateHoma() {
    const glu = parseNum(document.getElementById('homa-glucosa').value);
    const ins = parseNum(document.getElementById('homa-insulina').value);
    const box = document.getElementById('homa-result');

    if (Number.isNaN(glu) || Number.isNaN(ins) || glu <= 0 || ins <= 0) {
      box.className = 'result-box is-empty';
      box.textContent = 'Introduce glucosa e insulina en ayunas.';
      return;
    }

    const homa = (glu * ins) / 405;
    let tagClass = 'tag-ok';
    let label = 'Sensibilidad conservada (< 2.5)';
    if (homa >= 3.0) {
      tagClass = 'tag-alert';
      label = 'Sugestivo de resistencia a la insulina (≥ 3.0)';
    } else if (homa >= 2.5) {
      tagClass = 'tag-warn';
      label = 'Zona intermedia / límite (2.5–2.9)';
    }

    box.className = 'result-box';
    box.innerHTML = `
      <div class="result-main">
        <span class="result-value">HOMA-IR: ${fmt(homa, 2)}</span>
        <span class="result-tag ${tagClass}">${label}</span>
      </div>
      <p class="result-note">Referencia orientativa en ayunas; interpretar según contexto clínico y laboratorio.</p>
    `;
  }

  /* ==================== CALCULADORA 3: HbA1c <-> eAG ==================== */

  function renderHba1cSummary(a1c, mgdl, mmol) {
    const box = document.getElementById('a1c-result');
    let tagClass = 'tag-ok';
    let label = 'HbA1c < 5.7%';
    if (a1c >= 6.5) {
      tagClass = 'tag-alert';
      label = 'Rango diabetes (≥ 6.5%)';
    } else if (a1c >= 5.7) {
      tagClass = 'tag-warn';
      label = 'Rango prediabetes (5.7–6.4%)';
    }

    box.className = 'result-box';
    box.innerHTML = `
      <div class="result-main">
        <span class="result-value">${fmt(a1c, 1)}% ≈ ${Math.round(mgdl)} mg/dL</span>
        <span class="result-tag ${tagClass}">${label}</span>
      </div>
      <p class="result-note">Equivalencia aproximada: ${fmt(mmol, 1)} mmol/L de glucosa media estimada.</p>
    `;
  }

  function updateHba1c(source) {
    const a1cEl = document.getElementById('a1c-pct');
    const mgEl = document.getElementById('a1c-mgdl');
    const mmolEl = document.getElementById('a1c-mmol');
    const box = document.getElementById('a1c-result');

    let a1c = NaN;
    let mgdl = NaN;
    let mmol = NaN;

    if (source === 'a1c') {
      a1c = parseNum(a1cEl.value);
      if (Number.isNaN(a1c) || a1c <= 0) {
        mgEl.value = '';
        mmolEl.value = '';
        box.className = 'result-box is-empty';
        box.textContent = 'Edita cualquiera de los tres campos para convertir al instante.';
        return;
      }
      mgdl = 28.7 * a1c - 46.7;
      mmol = mgdl / 18.0182;
      mgEl.value = mgdl > 0 ? Math.round(mgdl).toString() : '';
      mmolEl.value = mmol > 0 ? fmt(mmol, 1) : '';
    } else if (source === 'mgdl') {
      mgdl = parseNum(mgEl.value);
      if (Number.isNaN(mgdl) || mgdl <= 0) {
        a1cEl.value = '';
        mmolEl.value = '';
        box.className = 'result-box is-empty';
        box.textContent = 'Edita cualquiera de los tres campos para convertir al instante.';
        return;
      }
      a1c = (mgdl + 46.7) / 28.7;
      mmol = mgdl / 18.0182;
      a1cEl.value = fmt(a1c, 1);
      mmolEl.value = fmt(mmol, 1);
    } else if (source === 'mmol') {
      mmol = parseNum(mmolEl.value);
      if (Number.isNaN(mmol) || mmol <= 0) {
        a1cEl.value = '';
        mgEl.value = '';
        box.className = 'result-box is-empty';
        box.textContent = 'Edita cualquiera de los tres campos para convertir al instante.';
        return;
      }
      mgdl = mmol * 18.0182;
      a1c = (mgdl + 46.7) / 28.7;
      a1cEl.value = fmt(a1c, 1);
      mgEl.value = Math.round(mgdl).toString();
    }

    if (mgdl <= 0) {
      box.className = 'result-box is-empty';
      box.textContent = 'Valor fuera de rango fisiológico habitual.';
      return;
    }

    renderHba1cSummary(a1c, mgdl, mmol);
  }

  /* ==================== CALCULADORA 4: IMC Y % PÉRDIDA DE PESO ==================== */

  function classifyImc(imc) {
    if (imc < 18.5) return { label: 'Bajo peso (< 18.5)', tag: 'tag-warn' };
    if (imc < 25) return { label: 'Normopeso (18.5–24.9)', tag: 'tag-ok' };
    if (imc < 30) return { label: 'Sobrepeso (25–29.9)', tag: 'tag-warn' };
    if (imc < 35) return { label: 'Obesidad grado I (30–34.9)', tag: 'tag-alert' };
    if (imc < 40) return { label: 'Obesidad grado II (35–39.9)', tag: 'tag-alert' };
    return { label: 'Obesidad grado III (≥ 40)', tag: 'tag-alert' };
  }

  function updateImc() {
    const peso = parseNum(document.getElementById('imc-peso').value);
    const tallaRaw = parseNum(document.getElementById('imc-talla').value);
    const previo = parseNum(document.getElementById('imc-previo').value);
    const box = document.getElementById('imc-result');

    if (Number.isNaN(peso) || Number.isNaN(tallaRaw) || peso <= 0 || tallaRaw <= 0) {
      box.className = 'result-box is-empty';
      box.textContent = 'Introduce peso actual y talla (el peso previo es opcional).';
      return;
    }

    /* Si la talla es < 3 asumimos metros (ej. 1.65), si no centímetros (ej. 165) */
    const tallaM = tallaRaw < 3 ? tallaRaw : tallaRaw / 100;
    const imc = peso / (tallaM * tallaM);
    const cat = classifyImc(imc);

    let cambioHtml = '';
    if (!Number.isNaN(previo) && previo > 0) {
      const diffKg = peso - previo;
      const pct = (diffKg / previo) * 100;
      const absPct = Math.abs(pct);
      const tipo = diffKg < 0 ? 'Pérdida' : (diffKg > 0 ? 'Ganancia' : 'Sin cambio');
      const alertaPerdida = diffKg < 0 && absPct >= 5
        ? ' (pérdida ≥ 5% clínicamente relevante)'
        : '';
      cambioHtml = `<p class="result-note"><strong>${tipo}:</strong> ${fmt(absPct, 1)}% (${diffKg > 0 ? '+' : ''}${fmt(diffKg, 1)} kg respecto a ${fmt(previo, 1)} kg)${alertaPerdida}.</p>`;
    }

    box.className = 'result-box';
    box.innerHTML = `
      <div class="result-main">
        <span class="result-value">IMC ${fmt(imc, 1)} kg/m²</span>
        <span class="result-tag ${cat.tag}">${cat.label}</span>
      </div>
      ${cambioHtml || '<p class="result-note">Añade el peso previo para calcular el % de cambio ponderal.</p>'}
    `;
  }

  /* ==================== CALCULADORA 5: CORTICOIDES ==================== */

  function updateCorticoides() {
    const tipo = document.getElementById('cort-tipo').value;
    const dosis = parseNum(document.getElementById('cort-dosis').value);
    const box = document.getElementById('cort-result');

    if (Number.isNaN(dosis) || dosis <= 0) {
      box.className = 'result-box is-empty';
      box.textContent = 'Introduce una dosis en mg para ver todas las equivalencias.';
      return;
    }

    const source = CORTICOIDES[tipo];
    const factor = dosis / source.eq;

    const itemsHtml = Object.entries(CORTICOIDES)
      .map(([key, info]) => {
        const eqDose = factor * info.eq;
        const decimals = eqDose < 2 ? 2 : 1;
        return `
          <div class="steroid-item ${key === tipo ? 'is-source' : ''}">
            <span class="steroid-name">${info.nombre}</span>
            <span class="steroid-dose">${fmt(eqDose, decimals)} mg</span>
          </div>
        `;
      })
      .join('');

    box.className = 'result-box';
    box.innerHTML = `
      <div class="result-main" style="margin-bottom: 4px;">
        <span style="font-weight: 700; font-size: 0.9rem; color: var(--primary-dark);">Dosis antiinflamatorias equivalentes</span>
      </div>
      <div class="steroid-grid">${itemsHtml}</div>
      <p class="result-note">Equivalencia glucocorticoidea orientativa; recordar mayor efecto mineralocorticoide de hidrocortisona.</p>
    `;
  }

  /* ==================== CALCULADORA 6: LEVOTIROXINA ==================== */

  function renderLevoChips(suggestedDose) {
    const container = document.getElementById('levo-chips');
    container.innerHTML = LEVO_DOSES.map((dose) => {
      const classes = ['dose-chip'];
      if (dose === suggestedDose) classes.push('suggested');
      if (dose === selectedLevoChip) classes.push('selected');
      return `<button type="button" class="${classes.join(' ')}" data-levo-dose="${dose}">${dose}</button>`;
    }).join('');
  }

  function updateLevo() {
    const peso = parseNum(document.getElementById('levo-peso').value);
    const box = document.getElementById('levo-result');

    if (Number.isNaN(peso) || peso <= 0) {
      renderLevoChips(null);
      if (selectedLevoChip) {
        box.className = 'result-box';
        box.innerHTML = `
          <div class="result-main">
            <span class="result-value">${selectedLevoChip} mcg/día</span>
            <span class="result-tag tag-ok">${selectedLevoChip * 7} mcg/semana</span>
          </div>
          <p class="result-note">Introduce el peso para calcular mcg/kg/día.</p>
        `;
      } else {
        box.className = 'result-box is-empty';
        box.textContent = 'Introduce el peso para estimar la dosis y resaltar la presentación más cercana.';
      }
      return;
    }

    const teorica = peso * levoFactor;
    const closest = LEVO_DOSES.reduce((prev, curr) =>
      Math.abs(curr - teorica) < Math.abs(prev - teorica) ? curr : prev
    );

    const activeDose = selectedLevoChip ?? closest;
    const actualMcgKg = activeDose / peso;
    renderLevoChips(closest);

    box.className = 'result-box';
    box.innerHTML = `
      <div class="result-main">
        <span class="result-value">Teórica: ${Math.round(teorica)} mcg/día</span>
        <span class="result-tag tag-ok">Sugerida: ${closest} mcg</span>
      </div>
      <p class="result-note">
        Con <strong>${activeDose} mcg/día</strong> (${activeDose * 7} mcg/sem) → <strong>${fmt(actualMcgKg, 2)} mcg/kg/día</strong>. Pulsa cualquier pastilla inferior para probar ajustes.
      </p>
    `;
  }

  /* ==================== VINCULAR CALCULADORAS Y BOTONES LIMPIAR ==================== */

  function clearCalculator(calcId) {
    if (calcId === 'calc-calcio') {
      document.getElementById('ca-medido').value = '';
      document.getElementById('ca-albumina').value = '';
      updateCalcio();
    } else if (calcId === 'calc-homa') {
      document.getElementById('homa-glucosa').value = '';
      document.getElementById('homa-insulina').value = '';
      updateHoma();
    } else if (calcId === 'calc-hba1c') {
      document.getElementById('a1c-pct').value = '';
      document.getElementById('a1c-mgdl').value = '';
      document.getElementById('a1c-mmol').value = '';
      const box = document.getElementById('a1c-result');
      box.className = 'result-box is-empty';
      box.textContent = 'Edita cualquiera de los tres campos para convertir al instante.';
    } else if (calcId === 'calc-imc') {
      document.getElementById('imc-peso').value = '';
      document.getElementById('imc-talla').value = '';
      document.getElementById('imc-previo').value = '';
      updateImc();
    } else if (calcId === 'calc-corticoides') {
      document.getElementById('cort-dosis').value = '';
      updateCorticoides();
    } else if (calcId === 'calc-levo') {
      document.getElementById('levo-peso').value = '';
      selectedLevoChip = null;
      updateLevo();
    }
  }

  function initCalculators() {
    document.getElementById('ca-medido').addEventListener('input', updateCalcio);
    document.getElementById('ca-albumina').addEventListener('input', updateCalcio);

    document.getElementById('homa-glucosa').addEventListener('input', updateHoma);
    document.getElementById('homa-insulina').addEventListener('input', updateHoma);

    document.getElementById('a1c-pct').addEventListener('input', () => updateHba1c('a1c'));
    document.getElementById('a1c-mgdl').addEventListener('input', () => updateHba1c('mgdl'));
    document.getElementById('a1c-mmol').addEventListener('input', () => updateHba1c('mmol'));

    document.getElementById('imc-peso').addEventListener('input', updateImc);
    document.getElementById('imc-talla').addEventListener('input', updateImc);
    document.getElementById('imc-previo').addEventListener('input', updateImc);

    document.getElementById('cort-tipo').addEventListener('change', updateCorticoides);
    document.getElementById('cort-dosis').addEventListener('input', updateCorticoides);

    document.getElementById('levo-peso').addEventListener('input', () => {
      selectedLevoChip = null;
      updateLevo();
    });

    document.querySelectorAll('[data-levo-factor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-levo-factor]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        levoFactor = Number(btn.dataset.levoFactor);
        selectedLevoChip = null;
        updateLevo();
      });
    });

    document.getElementById('levo-chips').addEventListener('click', (event) => {
      const chip = event.target.closest('[data-levo-dose]');
      if (!chip) return;
      const dose = Number(chip.dataset.levoDose);
      selectedLevoChip = selectedLevoChip === dose ? null : dose;
      updateLevo();
    });

    renderLevoChips(null);

    document.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-clear]');
      if (!btn) return;
      clearCalculator(btn.dataset.clear);
    });
  }

  /* ==================== COPIAR PLANTILLAS DE PAUTAS ==================== */

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.focus();
    helper.select();
    document.execCommand('copy');
    document.body.removeChild(helper);
  }

  function initTemplatesCopy() {
    document.addEventListener('click', async (event) => {
      const btn = event.target.closest('.btn-copy');
      if (!btn) return;
      const targetId = btn.dataset.copyTarget;
      const preview = document.querySelector(`[data-template-id="${targetId}"]`);
      if (!preview) return;

      try {
        await copyText(preview.textContent.trim());
        const originalText = btn.textContent;
        btn.textContent = 'Copiado ✓';
        showToast('Texto copiado para pegar en WhatsApp o correo');
        setTimeout(() => {
          btn.textContent = originalText;
        }, 1600);
      } catch {
        showToast('No se pudo copiar automáticamente');
      }
    });
  }

  /* ==================== BLOC DE NOTAS PRIVADO (localStorage) ==================== */

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Convierte URLs http/https en enlaces seguros clicables sin usar innerHTML no escapado.
   */
  function linkifySafe(text) {
    const escaped = escapeHtml(text);
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    return escaped.replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
  }

  function renderNotes() {
    const list = document.getElementById('notesList');
    const count = document.getElementById('notesCount');
    count.textContent = `${notes.length} ${notes.length === 1 ? 'nota' : 'notas'}`;

    if (notes.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p style="margin: 0 0 4px; font-weight: 600;">Aún no tienes notas guardadas</p>
          <p style="margin: 0; font-size: 0.85rem;">Puedes apuntar extensiones del hospital, enlaces a guías o recordatorios propios.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = notes.map((note) => {
      const dateStr = new Date(note.updatedAt).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      const titleHtml = note.title ? `<h3 class="card-title" style="margin-bottom: 6px;">${escapeHtml(note.title)}</h3>` : '';
      return `
        <article class="card searchable-item" data-note-id="${note.id}" data-keywords="${escapeHtml(note.title || '')} ${escapeHtml(note.body || '')}">
          ${titleHtml}
          <p class="note-item-body">${linkifySafe(note.body)}</p>
          <div class="note-meta">Guardado: ${dateStr}</div>
          <div class="card-footer-actions">
            <button class="btn btn-secondary" type="button" data-note-edit="${note.id}">Editar</button>
            <button class="btn btn-secondary" type="button" data-note-delete="${note.id}">Borrar</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function resetNoteForm() {
    editingNoteId = null;
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteBody').value = '';
    document.getElementById('noteSaveBtn').textContent = 'Guardar nota';
    document.getElementById('noteCancelEditBtn').classList.add('hidden');
  }

  function initNotes() {
    renderNotes();

    const form = document.getElementById('noteForm');
    const cancelBtn = document.getElementById('noteCancelEditBtn');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const title = document.getElementById('noteTitle').value.trim();
      const body = document.getElementById('noteBody').value.trim();

      if (!body) {
        showToast('Escribe algo antes de guardar la nota');
        document.getElementById('noteBody').focus();
        return;
      }

      if (editingNoteId) {
        notes = notes.map((n) =>
          n.id === editingNoteId ? { ...n, title, body, updatedAt: Date.now() } : n
        );
        showToast('Nota actualizada');
      } else {
        notes = [
          {
            id: `n-${Date.now()}`,
            title,
            body,
            updatedAt: Date.now()
          },
          ...notes
        ];
        showToast('Nota guardada en este dispositivo');
      }

      saveJSON(STORAGE_KEYS.notes, notes);
      resetNoteForm();
      renderNotes();
    });

    cancelBtn.addEventListener('click', resetNoteForm);

    document.getElementById('notesList').addEventListener('click', (event) => {
      const editBtn = event.target.closest('[data-note-edit]');
      if (editBtn) {
        const note = notes.find((n) => n.id === editBtn.dataset.noteEdit);
        if (!note) return;
        editingNoteId = note.id;
        document.getElementById('noteTitle').value = note.title || '';
        document.getElementById('noteBody').value = note.body || '';
        document.getElementById('noteSaveBtn').textContent = 'Actualizar nota';
        document.getElementById('noteCancelEditBtn').classList.remove('hidden');
        document.getElementById('noteBody').focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const delBtn = event.target.closest('[data-note-delete]');
      if (delBtn) {
        const id = delBtn.dataset.noteDelete;
        notes = notes.filter((n) => n.id !== id);
        if (editingNoteId === id) resetNoteForm();
        saveJSON(STORAGE_KEYS.notes, notes);
        renderNotes();
        showToast('Nota eliminada');
      }
    });
  }

  /* ==================== PWA: SERVICE WORKER, INSTALACIÓN Y OFFLINE ==================== */

  function initPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch(() => {
          /* En file:// no se registra SW; funciona correctamente bajo HTTP/HTTPS */
        });
      });
    }

    const installBtn = document.getElementById('installBtn');
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.classList.add('hidden');
    });

    window.addEventListener('appinstalled', () => {
      installBtn.classList.add('hidden');
      showToast('App instalada en el dispositivo');
    });

    const offlineBadge = document.getElementById('offlineBadge');
    const syncNetworkBadge = () => {
      offlineBadge.classList.toggle('hidden', navigator.onLine);
    };
    window.addEventListener('online', syncNetworkBadge);
    window.addEventListener('offline', syncNetworkBadge);
    syncNetworkBadge();
  }

  /* ==================== ARRANQUE ==================== */

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNavigationAndSearch();
    initFavorites();
    initCalculators();
    initTemplatesCopy();
    initNotes();
    initPWA();
  });
})();
