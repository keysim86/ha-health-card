class HealthCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._loaded = false;
    this._chart = null;
    this._daily = [];
    this._pressureLoaded = false;
  }

  setConfig(config) {
    this.config = {
      entity_id:        config.entity_id        || 'sensor.weight',
      start_weight:     config.start_weight     || 100.0,
      start_date:       config.start_date       || '2025-01-01',
      height_cm_entity: config.height_cm_entity || null,
      height_cm:        config.height_cm        || 175,
      history_days:     config.history_days     || 365,
      goals:            config.goals            || [],
      bp_systolic:      config.bp_systolic      || 'sensor.bp_grzegorz_skurczowe',
      bp_diastolic:     config.bp_diastolic     || 'sensor.bp_grzegorz_rozkurczowe',
      bp_pulse:         config.bp_pulse         || 'sensor.bp_grzegorz_puls',
      bp_category:      config.bp_category      || 'sensor.grzegorz_kategoria_cisnienia',
      report_name:      config.report_name      || 'Grzegorz Matiasik',
      report_birthdate: config.report_birthdate || '1986-06-06',
      report_device:    config.report_device    || 'Microlife BP A2 Basic',
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._loaded) {
      this._loaded = true;
      this._render();
      this._loadData();
    }
  }

  // --- POMOCNICZE ---
  _ts(s) {
    const t = s.last_changed || s.start;
    return new Date(t).getTime();
  }

  _day(ts) {
    return new Date(ts).toLocaleDateString('sv-SE');
  }

  _monthName(ym) {
    const n = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
    return n[parseInt(ym.split('-')[1]) - 1];
  }

  _heightCm() {
    if (this.config.height_cm_entity) {
      const e = this._hass && this._hass.states[this.config.height_cm_entity];
      if (e) return parseFloat(e.state);
    }
    return this.config.height_cm || 175;
  }

  _bmi(weight) {
    const h = this._heightCm() / 100;
    return Math.round(weight / (h * h) * 10) / 10;
  }

  _bmiCat(bmi) {
    if (bmi < 18.5) return { label: 'Niedowaga',    color: '#3B8BD4' };
    if (bmi < 25.0) return { label: 'Norma',         color: '#1D9E75' };
    if (bmi < 30.0) return { label: 'Nadwaga',       color: '#BA7517' };
    if (bmi < 35.0) return { label: 'Otyłość I°',    color: '#E24B4A' };
    return { label: 'Otyłość II°+', color: '#A32D2D' };
  }

  // --- RENDEROWANIE SZKIELETU ---
  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        #wrap { font-family: var(--primary-font-family, sans-serif); padding: 16px; color: var(--primary-text-color); }
        .nav { display: flex; gap: 8px; border-bottom: 1px solid var(--divider-color, #eee); margin-bottom: 16px; }
        .nav-btn { padding: 8px 12px; cursor: pointer; background: none; border: none; color: var(--secondary-text-color); border-bottom: 2px solid transparent; }
        .nav-btn.active { color: var(--primary-color, #1D9E75); border-bottom-color: var(--primary-color, #1D9E75); font-weight: bold; }
        .metric-grid, .bp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin-bottom: 16px; }
        .metric, .bp-metric { background: var(--secondary-background-color, #f5f5f5); border-radius: 12px; padding: 12px; text-align: center; }
        .metric-label, .bp-label { font-size: 11px; color: var(--secondary-text-color); }
        .metric-value, .bp-value { font-size: 20px; font-weight: bold; margin: 4px 0; }
        .bp-value { font-size: 24px; }
        .chart-wrap { height: 250px; position: relative; }
        .report-btn { padding: 10px 20px; border-radius: 8px; background: #1a5276; color: white; border: none; cursor: pointer; font-weight: bold; margin: 10px 0; }
        .loading { padding: 40px; text-align: center; }
        .nav-page { display: none; }
        .nav-page.active { display: block; }
        .alert { padding: 10px; border-radius: 8px; margin-bottom: 10px; font-size: 13px; }
        .alert.ok { background: #E1F5EE; color: #0F6E56; }
        .alert.warn { background: #FAEEDA; color: #854F0B; }
      </style>
      <ha-card>
        <div id="wrap">
          <div class="nav" id="health-nav">
            <button class="nav-btn active" data-page="weight">⚖ Waga</button>
            <button class="nav-btn" data-page="pressure">💊 Ciśnienie</button>
          </div>
          <div id="content-weight" class="nav-page active">
            <div id="weight-metrics"></div>
            <div class="chart-wrap"><canvas id="wChart"></canvas></div>
          </div>
          <div id="page-pressure" class="nav-page">
            <div class="loading">Ładowanie danych ciśnienia...</div>
          </div>
        </div>
      </ha-card>
    `;

    this.shadowRoot.getElementById('health-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (btn) this._switchPage(btn.getAttribute('data-page'));
    });
  }

  _switchPage(page) {
    this.shadowRoot.querySelectorAll('.nav-page').forEach(p => p.classList.remove('active'));
    this.shadowRoot.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    if (page === 'pressure') {
      this.shadowRoot.getElementById('page-pressure').classList.add('active');
      if (!this._pressureLoaded) this._loadPressureData();
    } else {
      this.shadowRoot.getElementById('content-weight').classList.add('active');
    }
    this.shadowRoot.querySelector(`[data-page="${page}"]`).classList.add('active');
  }

  // --- DANE WAGI (STATYSTYKI) ---
  async _loadData() {
    const start = new Date(); start.setDate(start.getDate() - this.config.history_days);
    try {
      const res = await this._hass.connection.sendMessagePromise({
        type: 'recorder/statistics_during_period',
        start_time: start.toISOString(),
        statistic_ids: [this.config.entity_id],
        period: 'hour',
        types: ['mean']
      });
      const stats = res[this.config.entity_id] || [];
      this._daily = stats.map(s => [this._day(this._ts(s)), s.mean]).filter(d => d[1] != null);
      this._updateWeightUI();
    } catch (e) { console.error(e); }
  }

  _updateWeightUI() {
    const last = this._daily[this._daily.length - 1];
    if (!last) return;
    const currentW = last[1];
    const bmi = this._bmi(currentW);
    const cat = this._bmiCat(bmi);

    this.shadowRoot.getElementById('weight-metrics').innerHTML = `
      <div class="metric-grid">
        <div class="metric"><div class="metric-label">Aktualna Waga</div><div class="metric-value">${currentW.toFixed(1)} kg</div></div>
        <div class="metric"><div class="metric-label">BMI</div><div class="metric-value" style="color:${cat.color}">${bmi}</div></div>
      </div>
    `;
    this._drawWeightChart();
  }

  // --- DANE CIŚNIENIA (HISTORIA) ---
  async _loadPressureData() {
    const container = this.shadowRoot.getElementById('page-pressure');
    try {
      const sys = this._hass.states[this.config.bp_systolic]?.state || '—';
      const dia = this._hass.states[this.config.bp_diastolic]?.state || '—';
      const pul = this._hass.states[this.config.bp_pulse]?.state || '—';

      container.innerHTML = `
        <div class="bp-grid">
          <div class="bp-metric"><div class="bp-label">Skurczowe</div><div class="bp-value">${sys}</div></div>
          <div class="bp-metric"><div class="bp-label">Rozkurczowe</div><div class="bp-value">${dia}</div></div>
          <div class="bp-metric"><div class="bp-label">Puls</div><div class="bp-value">${pul}</div></div>
        </div>
        <div style="text-align:center">
          <button class="report-btn" id="gen-pdf">📄 Generuj Raport PDF</button>
        </div>
      `;
      
      this.shadowRoot.getElementById('gen-pdf').addEventListener('click', () => this._generateBpPdf());
      this._pressureLoaded = true;
    } catch (e) { container.innerHTML = "Błąd ładowania."; }
  }

  // --- GENEROWANIE PDF (KLUCZOWA FUNKCJA) ---
  async _generateBpPdf() {
    const now = new Date();
    const start = new Date();
    start.setDate(now.getDate() - 30); // Domyślnie ostatnie 30 dni

    // Pobieramy historię stanów (nie statystyki), aby mieć realne punkty pomiarowe
    const fetchHistory = async (entityId) => {
      const url = `history/period/${start.toISOString()}?filter_entity_id=${entityId}&end_time=${now.toISOString()}&minimal_response&no_attributes`;
      return await this._hass.callApi('GET', url);
    };

    try {
      const historyData = await Promise.all([
        fetchHistory(this.config.bp_systolic),
        fetchHistory(this.config.bp_diastolic),
        fetchHistory(this.config.bp_pulse)
      ]);

      const measurements = new Map();

      // Grupowanie pomiarów wg czasu (tolerancja 1 minuty dla sesji)
      const process = (data, key) => {
        if (!data[0]) return;
        data[0].forEach(entry => {
          const d = new Date(entry.last_changed);
          const ts = d.setSeconds(0, 0); // Grupowanie do minuty
          if (!measurements.has(ts)) {
            measurements.set(ts, { ts, sys: null, dia: null, pul: null });
          }
          measurements.get(ts)[key] = Math.round(parseFloat(entry.state));
        });
      };

      process(historyData[0], 'sys');
      process(historyData[1], 'dia');
      process(historyData[2], 'pul');

      // Filtrowanie i sortowanie (tylko wiersze gdzie jest sys i dia)
      const tableData = Array.from(measurements.values())
        .filter(m => m.sys > 0 && m.dia > 0)
        .sort((a, b) => b.ts - a.ts);

      // Statystyki
      const allSys = tableData.map(d => d.sys);
      const allDia = tableData.map(d => d.dia);
      const avgSys = (allSys.reduce((a,b)=>a+b,0)/allSys.length).toFixed(1);
      const avgDia = (allDia.reduce((a,b)=>a+b,0)/allDia.length).toFixed(1);

      // Budowanie HTML raportu
      const rows = tableData.map(m => {
        const dt = new Date(m.ts);
        const cat = m.sys < 120 && m.dia < 80 ? 'Optymalne' : (m.sys < 140 && m.dia < 90 ? 'Prawidłowe' : 'Wysokie');
        const pora = dt.getHours() < 12 ? 'Rano' : (dt.getHours() < 18 ? 'Południe' : 'Wieczór');
        return `<tr>
          <td>${dt.toLocaleDateString('pl-PL')}</td>
          <td>${dt.toLocaleTimeString('pl-PL', {hour:'2-digit',minute:'2-digit'})}</td>
          <td>${pora}</td>
          <td style="font-weight:bold">${m.sys}</td>
          <td style="font-weight:bold">${m.dia}</td>
          <td>${m.pul || '—'}</td>
          <td>${cat}</td>
        </tr>`;
      }).join('');

      const html = `
        <html><head><meta charset="UTF-8"><style>
          body { font-family: Arial; padding: 20px; color: #333; }
          h1 { text-align: center; text-transform: uppercase; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background: #1a5276; color: white; padding: 10px; font-size: 12px; }
          td { border-bottom: 1px solid #ddd; padding: 8px; text-align: center; font-size: 13px; }
          .header-info { margin-bottom: 20px; line-height: 1.6; }
          .stat-box { border: 2px solid #1a5276; margin-top: 30px; }
          .footer { font-size: 10px; color: #888; margin-top: 20px; text-align: center; }
        </style></head>
        <body>
          <h1>Raport pomiarów ciśnienia tętniczego</h1>
          <div class="header-info">
            <b>Imię i nazwisko:</b> ${this.config.report_name}<br>
            <b>Data urodzenia:</b> ${this.config.report_birthdate}<br>
            <b>Urządzenie:</b> ${this.config.report_device}<br>
            <b>Okres:</b> ${start.toLocaleDateString()} - ${now.toLocaleDateString()}
          </div>
          <table>
            <thead><tr><th>Data</th><th>Czas</th><th>Pora</th><th>Skurczowe</th><th>Rozkurczowe</th><th>Puls</th><th>Kategoria</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <table class="stat-box">
            <thead><tr><th>Parametr</th><th>Średnia</th><th>Min</th><th>Max</th><th>Ocena</th></tr></thead>
            <tbody>
              <tr><td>Skurczowe</td><td>${avgSys}</td><td>${Math.min(...allSys)}</td><td>${Math.max(...allSys)}</td><td rowspan="2">Prawidłowe</td></tr>
              <tr><td>Rozkurczowe</td><td>${avgDia}</td><td>${Math.min(...allDia)}</td><td>${Math.max(...allDia)}</td></tr>
            </tbody>
          </table>
          <div class="footer">Data generowania: ${now.toLocaleString()} | Liczba pomiarów: ${tableData.length}</div>
        </body></html>
      `;

      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    } catch (e) { console.error("PDF Error:", e); }
  }

  _drawWeightChart() {
    const canvas = this.shadowRoot.getElementById('wChart');
    if (!canvas || !window.Chart) return;
    if (this._chart) this._chart.destroy();

    this._chart = new window.Chart(canvas, {
      type: 'line',
      data: {
        labels: this._daily.map(d => d[0]),
        datasets: [{
          label: 'Waga (kg)',
          data: this._daily.map(d => d[1]),
          borderColor: '#3498db',
          fill: false,
          tension: 0.4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

customElements.define('health-card', HealthCard);