class HealthCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._loaded = false;
    this._chart  = null;
    this._daily  = [];
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

  _ts(s) {
    if (typeof s.start === 'number') {
      // HA zwraca start w sekundach jeśli < 1e12, w milisekundach jeśli >= 1e12
      return s.start < 1e12 ? s.start * 1000 : s.start;
    }
    return new Date(s.start).getTime();
  }

  _day(ts) {
    return new Date(ts).toLocaleDateString('sv-SE');
  }

  _monthName(ym) {
    const n = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
               'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
    return n[parseInt(ym.split('-')[1]) - 1];
  }

  _daysUntil(dateStr) {
    const now = new Date(); now.setHours(0,0,0,0);
    const t   = new Date(dateStr); t.setHours(0,0,0,0);
    return Math.round((t - now) / 86400000);
  }

  _rollingAvg(values, w) {
    w = w || 7;
    return values.map(function(_, i) {
      var s = values.slice(Math.max(0, i - w + 1), i + 1);
      return Math.round(s.reduce(function(a,b){return a+b;},0) / s.length * 10) / 10;
    });
  }

  _heightCm() {
    if (this.config.height_cm_entity) {
      var e = this._hass && this._hass.states[this.config.height_cm_entity];
      if (e) return parseFloat(e.state);
    }
    return this.config.height_cm || 175;
  }

  _bmi(weight) {
    var h = this._heightCm() / 100;
    return Math.round(weight / (h * h) * 10) / 10;
  }

  _bmiCat(bmi) {
    if (bmi < 18.5) return { label: 'Niedowaga',    color: '#3B8BD4' };
    if (bmi < 25.0) return { label: 'Norma',         color: '#1D9E75' };
    if (bmi < 30.0) return { label: 'Nadwaga',       color: '#BA7517' };
    if (bmi < 35.0) return { label: 'Otyłość I°',    color: '#E24B4A' };
    if (bmi < 40.0) return { label: 'Otyłość I°I',   color: '#A32D2D' };
    return           { label: 'Otyłość I°II', color: '#701515' };
  }

  _calcMonthly(daily) {
    var byMonth = new Map();
    for (var i = 0; i < daily.length; i++) {
      var date = daily[i][0];
      var val  = daily[i][1];
      var m    = date.slice(0, 7);
      if (!byMonth.has(m)) byMonth.set(m, { first: val, last: val });
      byMonth.get(m).last = val;
    }
    var months = Array.from(byMonth.keys()).sort();
    var recent = months.slice(-12);
    return recent.map(function(m) {
      var idx    = months.indexOf(m);
      var startW = byMonth.get(m).first;
      var endW   = idx + 1 < months.length ? byMonth.get(months[idx+1]).first : byMonth.get(m).last;
      var partial = idx + 1 >= months.length;
      return { month: m, startW: startW, endW: endW, diff: Math.round((endW - startW)*100)/100, partial: partial };
    }).reverse();
  }

  _calcWeekly(daily) {
    var byWeek = new Map();
    for (var i = 0; i < daily.length; i++) {
      var date = daily[i][0];
      var val  = daily[i][1];
      var d    = new Date(date);
      var day  = d.getDay() || 7;
      var mon  = new Date(d);
      mon.setDate(d.getDate() - day + 1);
      var key  = mon.toLocaleDateString('sv-SE');
      if (!byWeek.has(key)) byWeek.set(key, { first: val, last: val });
      byWeek.get(key).last = val;
    }
    var weeks  = Array.from(byWeek.keys()).sort();
    var recent = weeks.slice(-16);
    var self   = this;
    return recent.map(function(w) {
      var idx    = weeks.indexOf(w);
      var startW = byWeek.get(w).first;
      var endW   = idx + 1 < weeks.length ? byWeek.get(weeks[idx+1]).first : byWeek.get(w).last;
      var partial = idx + 1 >= weeks.length;
      return { week: w, label: w.slice(5), startW: startW, endW: endW, diff: Math.round((endW - startW)*100)/100, partial: partial };
    }).reverse();
  }

  async _fetchStats(startDate, endDate, period) {
    return this._hass.callWS({
      type:          'recorder/statistics_during_period',
      start_time:    startDate.toISOString(),
      end_time:      endDate.toISOString(),
      statistic_ids: [this.config.entity_id],
      period:        period,
      units:         { mass: 'kg' },
      types:         ['mean', 'state'],
    });
  }

  async _loadData() {
    var content = this.shadowRoot.getElementById('content');
    var self    = this;
    try {
      var now   = new Date();
      var start = new Date(now);
      start.setDate(start.getDate() - this.config.history_days);
      var cutST = new Date(now.getTime() - 48 * 3600 * 1000);

      var results = await Promise.all([
        this._fetchStats(start, now, 'hour'),
        this._fetchStats(cutST, now, '5minute'),
      ]);

      var ltRaw    = results[0];
      var stRaw    = results[1];
      var ltStats  = ltRaw[this.config.entity_id] || [];
      var stStats  = stRaw[this.config.entity_id] || [];

      if (ltStats.length === 0 && stStats.length === 0) {
        content.innerHTML = '<div style="padding:14px;font-size:12px;color:var(--primary-text-color)">'
          + '<b>Brak danych w statystykach</b><br><br>'
          + 'Encja: <code>' + this.config.entity_id + '</code><br>'
          + 'Klucze LT: ' + JSON.stringify(Object.keys(ltRaw)) + '<br>'
          + 'Klucze ST: ' + JSON.stringify(Object.keys(stRaw))
          + '</div>';
        return;
      }

      var map = new Map();

      for (var i = 0; i < ltStats.length; i++) {
        var s   = ltStats[i];
        var val = s.mean != null ? s.mean : s.state;
        if (val == null || isNaN(val)) continue;
        var day = this._day(this._ts(s));
        if (!map.has(day)) map.set(day, Math.round(val * 100) / 100);
      }

      // Short-term: bierzemy OSTATNIĄ wartość każdego dnia (najświeższa)
      var stMap = new Map();
      for (var j = 0; j < stStats.length; j++) {
        var ss   = stStats[j];
        var sval = ss.mean != null ? ss.mean : ss.state;
        if (sval == null || isNaN(sval)) continue;
        var sday = this._day(this._ts(ss));
        stMap.set(sday, Math.round(sval * 100) / 100);
      }
      stMap.forEach(function(v, k) { map.set(k, v); });

      var daily = Array.from(map.entries()).sort(function(a,b){ return a[0].localeCompare(b[0]); });

      if (daily.length === 0) {
        content.innerHTML = '<div style="color:#E24B4A;padding:20px;text-align:center">Brak przetworzonych danych.</div>';
        return;
      }

      this._daily = daily;
      this._updateUI(daily);

    } catch(err) {
      content.innerHTML = '<div style="color:#E24B4A;padding:20px;text-align:center">Błąd: ' + err.message + '</div>';
    }
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        #wrap {
          font-family: var(--primary-font-family, -apple-system, sans-serif);
          font-size: 14px;
          color: var(--primary-text-color);
          padding: 16px;
        }
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-bottom: 16px;
        }
        @media (min-width: 420px) { .metric-grid { grid-template-columns: repeat(4, 1fr); } }
        .metric { background: var(--secondary-background-color); border-radius: 12px; padding: 12px; }
        .metric-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 4px; }
        .metric-value { font-size: 20px; font-weight: 500; }
        .metric-value.good { color: #1D9E75; }
        .metric-sub { font-size: 11px; color: var(--secondary-text-color); margin-top: 2px; }
        .bmi-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
        .bmi-card { background: var(--secondary-background-color); border-radius: 12px; padding: 12px; }
        .bmi-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 4px; }
        .bmi-value { font-size: 20px; font-weight: 500; }
        .bmi-cat   { font-size: 12px; margin-top: 3px; font-weight: 500; }
        .bmi-bar   { margin-top: 8px; height: 6px; border-radius: 4px; overflow: hidden;
          background: linear-gradient(to right,#3B8BD4 16%,#1D9E75 16% 40%,#BA7517 40% 60%,#E24B4A 60% 80%,#A32D2D 80%); }
        .bmi-marker-wrap { position: relative; height: 10px; margin-top: 2px; }
        .bmi-marker { position: absolute; width: 2px; height: 10px; background: var(--primary-text-color); border-radius: 1px; transform: translateX(-50%); }
        .alert { border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px; }
        .alert.warn { background:#FAEEDA; color:#854F0B; border:0.5px solid #BA7517; }
        .alert.ok   { background:#E1F5EE; color:#0F6E56; border:0.5px solid #1D9E75; }
        h3 { font-size: 12px; font-weight: 500; color: var(--secondary-text-color); margin: 16px 0 8px; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; }
        .tabs { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
        .tab { padding: 5px 12px; border-radius: 8px; font-size: 12px; cursor: pointer; background: var(--secondary-background-color); color: var(--secondary-text-color); border: 0.5px solid transparent; user-select: none; }
        .tab.active { background: var(--primary-color, #1D9E75); color: #fff; }
        .balance-grid { display: grid; gap: 5px; margin-bottom: 4px; }
        .bal-row { display: grid; grid-template-columns: 90px 1fr 70px; align-items: center; gap: 8px; font-size: 12px; }
        .bal-name { color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bal-bar-wrap { height: 8px; border-radius: 4px; background: var(--secondary-background-color); overflow: hidden; }
        .bal-bar  { height: 100%; border-radius: 4px; }
        .bal-val  { text-align: right; font-weight: 500; }
        .bal-val.neg { color: #1D9E75; }
        .bal-val.pos { color: #E24B4A; }
        .bal-detail { font-size: 10px; color: var(--secondary-text-color); }
        .prog-wrap { margin-bottom: 10px; }
        .prog-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--secondary-text-color); margin-bottom: 3px; }
        .prog-bg   { background: var(--secondary-background-color); border-radius: 8px; height: 8px; overflow: hidden; }
        .prog-fill { height: 100%; border-radius: 8px; transition: width .5s ease; }
        .prog-sub  { font-size: 11px; color: var(--secondary-text-color); margin-top: 2px; }
        .prog-grid { display: grid; grid-template-columns: 1fr; gap: 2px; }
        @media (min-width: 450px) { .prog-grid { grid-template-columns: 1fr 1fr; gap: 8px; } }
        .legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11px; color: var(--secondary-text-color); margin-bottom: 8px; }
        .legend span { display: flex; align-items: center; gap: 4px; }
        .ldot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
        .chart-wrap { position: relative; width: 100%; height: 250px; }
        .note { font-size: 10px; color: var(--secondary-text-color); margin-top: 4px; }
        .loading { text-align: center; color: var(--secondary-text-color); padding: 40px; }
        code { background: var(--secondary-background-color); padding: 1px 4px; border-radius: 4px; font-size: 11px; }
      </style>
      <ha-card>
        <div id="wrap">
          <div id="content"><div class="loading">Ładowanie danych...</div></div>
        </div>
      </ha-card>
    `;
  }

  _updateUI(daily) {
    var labels   = daily.map(function(d){ return d[0]; });
    var weights  = daily.map(function(d){ return d[1]; });
    var trend    = this._rollingAvg(weights);
    var monthly  = this._calcMonthly(daily);
    var weekly   = this._calcWeekly(daily);
    var self     = this;

    var currentW    = weights[weights.length - 1];
    var currentDate = labels[labels.length - 1];
    var totalLoss   = Math.round((this.config.start_weight - currentW) * 100) / 100;
    var days        = Math.round((new Date(currentDate) - new Date(this.config.start_date)) / 86400000);
    var weeklyAvg   = Math.round(totalLoss / (days / 7) * 100) / 100;

    var h        = this._heightCm();
    var bmiNow   = this._bmi(currentW);
    var bmiStart = this._bmi(this.config.start_weight);
    var bmiCat   = this._bmiCat(bmiNow);
    var bmiPct   = Math.min(100, Math.max(0, (bmiNow - 15) / 30 * 100));
    var normKg   = Math.round(25 * Math.pow(h/100, 2) * 100) / 100;

    var bdGoal   = this.config.goals.find(function(g){ return g.key === 'blood_donation'; });
    var bdDays   = bdGoal ? this._daysUntil(bdGoal.date) : 999;
    var bdDone   = bdGoal && currentW <= bdGoal.weight;
    var alertHtml = '';
    if (bdGoal && bdDays >= -1 && bdDays <= 7) {
      alertHtml = bdDone
        ? '<div class="alert ok">Cel krwiodawstwa osiągnięty! ' + currentW.toFixed(2) + ' kg &le; ' + bdGoal.weight + ' kg</div>'
        : '<div class="alert warn">Krwiodawstwo ' + bdGoal.date + ' &mdash; brakuje ' + (currentW - bdGoal.weight).toFixed(2) + ' kg do ' + bdGoal.weight + ' kg</div>';
    }

    var goalsHtml = this.config.goals.map(function(g) {
      var total     = self.config.start_weight - g.weight;
      var done      = self.config.start_weight - currentW;
      var pct       = Math.min(100, Math.max(0, Math.round(done / total * 100)));
      var remaining = Math.max(0, Math.round((currentW - g.weight) * 100) / 100);
      var dLeft     = self._daysUntil(g.date);
      var needed    = dLeft > 0 ? (remaining / (dLeft / 7)).toFixed(2) : '—';
      return '<div class="prog-wrap">'
        + '<div class="prog-label"><span>' + g.label + ' &mdash; ' + g.weight + ' kg</span><span>' + pct + '%</span></div>'
        + '<div class="prog-bg"><div class="prog-fill" style="width:' + pct + '%;background:' + (g.color||'#1D9E75') + '"></div></div>'
        + '<div class="prog-sub">Brakuje ' + remaining + ' kg &middot; ' + dLeft + ' dni &middot; ' + needed + ' kg/tydz.</div>'
        + '</div>';
    }).join('');

    var balRows = function(data, nameKey, nameFn) {
      return data.map(function(b) {
        var barW = Math.min(100, Math.abs(b.diff) / 5 * 100);
        var neg  = b.diff <= 0;
        return '<div class="bal-row">'
          + '<div class="bal-name">' + nameFn(b[nameKey]) + (b.partial ? '*' : '') + '</div>'
          + '<div class="bal-bar-wrap"><div class="bal-bar" style="width:' + barW + '%;background:' + (neg?'#1D9E75':'#E24B4A') + '"></div></div>'
          + '<div style="display:flex;flex-direction:column;align-items:flex-end">'
          + '<div class="bal-val ' + (neg?'neg':'pos') + '">' + (neg?'':'+') + b.diff.toFixed(2) + '</div>'
          + '<div class="bal-detail">' + b.startW.toFixed(2) + '&rarr;' + b.endW.toFixed(2) + '</div>'
          + '</div></div>';
      }).join('');
    };

    var legendGoals = this.config.goals.map(function(g) {
      return '<span><span class="ldot" style="background:' + (g.color||'#888') + '"></span>' + g.weight + ' kg</span>';
    }).join('');

    this.shadowRoot.getElementById('content').innerHTML =
      alertHtml +
      '<div class="metric-grid">' +
        '<div class="metric"><div class="metric-label">Start (' + this.config.start_date + ')</div><div class="metric-value">' + this.config.start_weight.toFixed(2) + ' kg</div><div class="metric-sub">punkt wyjścia</div></div>' +
        '<div class="metric"><div class="metric-label">Aktualnie (' + currentDate + ')</div><div class="metric-value good">' + currentW.toFixed(2) + ' kg</div><div class="metric-sub">ostatni odczyt</div></div>' +
        '<div class="metric"><div class="metric-label">Łączna utrata</div><div class="metric-value good">&minus;' + totalLoss.toFixed(2) + ' kg</div><div class="metric-sub">przez ' + days + ' dni</div></div>' +
        '<div class="metric"><div class="metric-label">Średnie tempo</div><div class="metric-value good">&minus;' + weeklyAvg.toFixed(2) + ' kg</div><div class="metric-sub">na tydzień</div></div>' +
      '</div>' +
      '<div class="bmi-row">' +
        '<div class="bmi-card"><div class="bmi-label">BMI na starcie</div><div class="bmi-value" style="color:' + this._bmiCat(bmiStart).color + '">' + bmiStart + '</div><div class="bmi-cat" style="color:' + this._bmiCat(bmiStart).color + '">' + this._bmiCat(bmiStart).label + '</div><div class="bmi-bar"></div><div class="bmi-marker-wrap"><div class="bmi-marker" style="left:' + Math.min(100, Math.max(0, (bmiStart - 15) / 30 * 100)) + '%"></div></div><div style="font-size:11px;color:var(--secondary-text-color);margin-top:8px">Zmiana BMI: <b>' + (Math.round((bmiNow-bmiStart)*10)/10) + '</b></div><div style="font-size:11px;color:var(--secondary-text-color);margin-top:2px">Norma (BMI 25) = ' + normKg.toFixed(2) + ' kg</div></div>' +
        '<div class="bmi-card"><div class="bmi-label">BMI teraz (wzrost ' + h + ' cm)</div><div class="bmi-value" style="color:' + bmiCat.color + '">' + bmiNow + '</div><div class="bmi-cat" style="color:' + bmiCat.color + '">' + bmiCat.label + '</div><div class="bmi-bar"></div><div class="bmi-marker-wrap"><div class="bmi-marker" style="left:' + bmiPct + '%"></div></div></div>' +
      '</div>' +
      '<h3>&#127937; Postęp do celów</h3>' +
      '<div class="prog-grid">' + goalsHtml + '</div>' +
      '<h3>&#128197; Bilanse</h3>' +
      '<div class="tabs">' +
        '<div class="tab active" id="tab-monthly" onclick="this.getRootNode().host._switchTab(\'monthly\')">Miesięczne</div>' +
        '<div class="tab" id="tab-weekly" onclick="this.getRootNode().host._switchTab(\'weekly\')">Tygodniowe</div>' +
      '</div>' +
      '<div id="bal-monthly" class="balance-grid">' + balRows(monthly, 'month', function(m){ return self._monthName(m); }) + '<div class="note">* miesiąc niepełny &middot; pierwsza waga miesiąca &rarr; pierwsza waga kolejnego</div></div>' +
      '<div id="bal-weekly" class="balance-grid" style="display:none">' + balRows(weekly, 'week', function(w){ return w.slice(5); }) + '<div class="note">* tydzień niepełny &middot; ostatnie 16 tygodni</div></div>' +
      '<h3>&#128200; Historia wagi</h3>' +
      '<div class="tabs">' +
        '<div class="tab active" id="range-all" onclick="this.getRootNode().host._switchRange(\'all\')">Od początku</div>' +
        '<div class="tab" id="range-6m" onclick="this.getRootNode().host._switchRange(\'6m\')">6 mies.</div>' +
        '<div class="tab" id="range-3m" onclick="this.getRootNode().host._switchRange(\'3m\')">3 mies.</div>' +
        '<div class="tab" id="range-30d" onclick="this.getRootNode().host._switchRange(\'30d\')">30 dni</div>' +
        '<div class="tab" id="range-14d" onclick="this.getRootNode().host._switchRange(\'14d\')">14 dni</div>' +
        '<div class="tab" id="range-7d" onclick="this.getRootNode().host._switchRange(\'7d\')">7 dni</div>' +
      '</div>' +
      '<div class="legend"><span><span class="ldot" style="background:#378ADD"></span>Dzienna waga</span><span><span class="ldot" style="background:#1D9E75"></span>Trend 7 dni</span>' + legendGoals + '</div>' +
      '<div class="chart-wrap"><canvas id="wChart"></canvas></div>';

    this._drawChart(labels, weights, trend);
  }

  _switchTab(tab) {
    var r = this.shadowRoot;
    r.getElementById('tab-monthly').classList.toggle('active', tab === 'monthly');
    r.getElementById('tab-weekly').classList.toggle('active', tab === 'weekly');
    r.getElementById('bal-monthly').style.display = tab === 'monthly' ? '' : 'none';
    r.getElementById('bal-weekly').style.display  = tab === 'weekly'  ? '' : 'none';
  }

  _switchRange(range) {
    var r          = this.shadowRoot;
    var self       = this;
    ['all','6m','3m','30d','14d','7d'].forEach(function(x) {
      var el = r.getElementById('range-' + x);
      if (el) el.classList.toggle('active', x === range);
    });
    var allLabels  = this._daily.map(function(d){ return d[0]; });
    var allWeights = this._daily.map(function(d){ return d[1]; });
    var labels, weights;
    if (range === 'all') {
      labels = allLabels; weights = allWeights;
    } else {
      var now = new Date();
      var cut = new Date(now);
      if (range === '7d')  cut.setDate(now.getDate() - 7);
      if (range === '14d') cut.setDate(now.getDate() - 14);
      if (range === '30d') cut.setDate(now.getDate() - 30);
      if (range === '3m')  cut.setMonth(now.getMonth() - 3);
      if (range === '6m')  cut.setMonth(now.getMonth() - 6);
      var cutStr = cut.toLocaleDateString('sv-SE');
      var idx    = allLabels.findIndex(function(l){ return l >= cutStr; });
      var from   = idx >= 0 ? idx : 0;
      labels  = allLabels.slice(from);
      weights = allWeights.slice(from);
    }
    if (this._chart) { this._chart.destroy(); this._chart = null; }
    this._initChart(labels, weights, this._rollingAvg(weights));
  }

  _drawChart(labels, weights, trend) {
    var self = this;
    if (window.Chart) {
      this._initChart(labels, weights, trend);
    } else {
      var s  = document.createElement('script');
      s.src  = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
      s.onload = function() { self._initChart(labels, weights, trend); };
      document.head.appendChild(s);
    }
  }

  _initChart(labels, weights, trend) {
    var canvas = this.shadowRoot.getElementById('wChart');
    if (!canvas) return;
    var goalDatasets = this.config.goals.map(function(g, i) {
      return {
        type: 'line',
        label: g.weight + ' kg',
        data: labels.map(function(){ return g.weight; }),
        borderColor: g.color || '#888',
        borderWidth: 1.2,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: false,
        order: 5 + i
      };
    });
    this._chart = new window.Chart(canvas, {
      data: {
        labels: labels,
        datasets: [
          {
            type: 'line', label: 'Waga', data: weights,
            borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.08)',
            borderWidth: 1.5, pointRadius: 2, pointHoverRadius: 5,
            tension: 0.3, fill: true, order: 3
          },
          {
            type: 'line', label: 'Trend', data: trend,
            borderColor: '#1D9E75', borderWidth: 2.5,
            pointRadius: 0, tension: 0.4, fill: false, order: 2
          }
        ].concat(goalDatasets)
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                return ctx.datasetIndex >= 2 ? null : ' ' + ctx.parsed.y.toFixed(2) + ' kg';
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 8, color: '#73726c', font: { size: 11 }, maxRotation: 30 },
            grid: { display: false }
          },
          y: {
            min: 85,
            max: Math.ceil(this.config.start_weight + 2),
            ticks: { callback: function(v){ return v + ' kg'; }, color: '#73726c', font: { size: 11 }, stepSize: 5 },
            grid: { color: 'rgba(128,128,128,0.1)' }
          }
        }
      }
    });
  }

  getCardSize() { return 12; }
}

customElements.define('health-card', HealthCard);
