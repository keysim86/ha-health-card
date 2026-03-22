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
      bp_systolic:  config.bp_systolic  || 'sensor.bp_grzegorz_skurczowe',
      bp_diastolic: config.bp_diastolic || 'sensor.bp_grzegorz_rozkurczowe',
      bp_pulse:     config.bp_pulse     || 'sensor.bp_grzegorz_puls',
      bp_category:  config.bp_category  || 'sensor.grzegorz_kategoria_cisnienia',
      report_name:      config.report_name      || 'Imię Nazwisko',
      report_birthdate: config.report_birthdate || '',
      report_device:    config.report_device    || 'Ciśnieniomierz',
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
    return this._hass.connection.sendMessagePromise({
      type:           'recorder/statistics_during_period',
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
        .nav { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--divider-color, rgba(255,255,255,0.1)); padding-bottom: 0; }
        .nav-btn { padding: 8px 16px; font-size: 13px; cursor: pointer; background: none; border: none; color: var(--secondary-text-color); border-bottom: 2px solid transparent; margin-bottom: -1px; user-select: none; font-family: inherit; }
        .nav-btn:hover { color: var(--primary-text-color); }
        .nav-btn.active { color: var(--primary-color, #1D9E75); border-bottom-color: var(--primary-color, #1D9E75); font-weight: 500; }
        .nav-page { display: none; }
        .nav-page.active { display: block; }
        .empty-page { text-align: center; padding: 60px 20px; color: var(--secondary-text-color); font-size: 14px; }
        .empty-page .icon { font-size: 48px; margin-bottom: 12px; }
        .empty-page .title { font-size: 16px; font-weight: 500; color: var(--primary-text-color); margin-bottom: 8px; }
        .bp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
        .bp-metric { background: var(--secondary-background-color); border-radius: 12px; padding: 12px; text-align: center; }
        .bp-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 4px; }
        .bp-value { font-size: 28px; font-weight: 500; }
        .bp-unit  { font-size: 13px; color: var(--secondary-text-color); margin-left: 2px; }
        .bp-alert { border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px; }
        .bp-alert.ok      { background:#E1F5EE; color:#0F6E56; border:0.5px solid #1D9E75; }
        .bp-alert.warn    { background:#FAEEDA; color:#854F0B; border:0.5px solid #BA7517; }
        .bp-alert.danger  { background:#FCEBEB; color:#A32D2D; border:0.5px solid #E24B4A; }
        .bp-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 16px; }
        .bp-stat  { background: var(--secondary-background-color); border-radius: 10px; padding: 10px; text-align: center; }
        .bp-stat-label { font-size: 10px; color: var(--secondary-text-color); margin-bottom: 3px; }
        .bp-stat-val   { font-size: 15px; font-weight: 500; }
        .report-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; border: 0.5px solid var(--color-border-secondary, rgba(255,255,255,0.2)); background: var(--secondary-background-color); color: var(--primary-text-color); font-size: 13px; cursor: pointer; font-family: inherit; margin-bottom: 16px; }
        .report-btn:hover { background: var(--primary-color, #1D9E75); color: #fff; }
        .report-period { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 13px; color: var(--secondary-text-color); }
        .report-period select { background: var(--secondary-background-color); color: var(--primary-text-color); border: 0.5px solid var(--color-border-secondary, rgba(255,255,255,0.2)); border-radius: 8px; padding: 5px 10px; font-size: 13px; font-family: inherit; cursor: pointer; }

      </style>
      <ha-card>
        <div id="wrap">
          <div class="nav" id="health-nav">
            <button class="nav-btn active" data-page="weight">&#9878; Waga</button>
            <button class="nav-btn" data-page="pressure">&#128138; Ci&#347;nienie</button>
            <button class="nav-btn" data-page="activity">&#127939; Aktywno&#347;&#263;</button>
            <button class="nav-btn" data-page="settings">&#9881; Konfiguracja</button>
          </div>
          <div id="content"><div class="loading">Ładowanie danych...</div></div>
          <div id="page-pressure" class="nav-page" style="display:none"></div>
          <div id="page-activity" class="nav-page" style="display:none"><div class="empty-page"><div class="icon">&#127939;</div><div class="title">Aktywno&#347;&#263;</div><div>W budowie &mdash; wkr&oacute;tce</div></div></div>
          <div id="page-settings" class="nav-page" style="display:none"><div class="empty-page"><div class="icon">&#9881;</div><div class="title">Konfiguracja</div><div>W budowie &mdash; wkr&oacute;tce</div></div></div>
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
      '<div id="page-weight" class="nav-page active">' +
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
      '<div class="chart-wrap"><canvas id="wChart"></canvas></div>' +
      '</div>';

    this._drawChart(labels, weights, trend);
    var nav = this.shadowRoot.getElementById('health-nav');
    if (nav) {
      var self = this;
      nav.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-page]');
        if (btn) self._switchPage(btn.getAttribute('data-page'));
      });
    }
  }

  _switchPage(page) {
    var self = this;
    if (page === 'pressure' && !this._pressureLoaded) {
      this._pressureLoaded = true;
      this._loadPressureData();
    }
    var r = this.shadowRoot;
    var content = r.getElementById('content');
    if (content) content.style.display = page === 'weight' ? '' : 'none';
    ['pressure', 'activity', 'settings'].forEach(function(p) {
      var el = r.getElementById('page-' + p);
      if (el) el.style.display = p === page ? 'block' : 'none';
    });
    var nav = r.getElementById('health-nav');
    if (nav) {
      nav.querySelectorAll('.nav-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-page') === page);
      });
    }
  }

  async _loadPressureData() {
    var self = this;
    var page = this.shadowRoot.getElementById('page-pressure');
    if (!page) return;
    page.innerHTML = '<div class="loading">&#321;adowanie danych ci&#347;nienia...</div>';
    try {
      var now   = new Date();
      var start = new Date(now);
      start.setDate(start.getDate() - 90);

      var results = await Promise.all([
        this._fetchStatsByEntity(this.config.bp_systolic,  start, now, 'hour'),
        this._fetchStatsByEntity(this.config.bp_diastolic, start, now, 'hour'),
        this._fetchStatsByEntity(this.config.bp_pulse,     start, now, 'hour'),
      ]);

      var sysStats  = results[0][this.config.bp_systolic]  || [];
      var diaStats  = results[1][this.config.bp_diastolic] || [];
      var pulStats  = results[2][this.config.bp_pulse]     || [];

      if (sysStats.length === 0) {
        page.innerHTML = '<div class="empty-page"><div class="icon">&#128138;</div><div class="title">Brak danych</div><div>Sprawd&#378; encje ci&#347;nienia w konfiguracji</div></div>';
        return;
      }

      var sysState = this._hass.states[this.config.bp_systolic];
      var diaState = this._hass.states[this.config.bp_diastolic];
      var pulState = this._hass.states[this.config.bp_pulse];
      var catState = this.config.bp_category ? this._hass.states[this.config.bp_category] : null;

      var sysNow = sysState ? Math.round(parseFloat(sysState.state)) : '—';
      var diaNow = diaState ? Math.round(parseFloat(diaState.state)) : '—';
      var pulNow = pulState ? Math.round(parseFloat(pulState.state)) : '—';
      var catNow = catState ? catState.state : null;

      var cutDate = new Date(now); cutDate.setDate(cutDate.getDate() - 30);
      var cutStr  = cutDate.toLocaleDateString('sv-SE');

      var sysRecent = sysStats.filter(function(s) {
        return self._day(self._ts(s)) >= cutStr;
      }).map(function(s){ return s.mean != null ? s.mean : s.state; }).filter(function(v){ return !isNaN(v); });

      var diaRecent = diaStats.filter(function(s) {
        return self._day(self._ts(s)) >= cutStr;
      }).map(function(s){ return s.mean != null ? s.mean : s.state; }).filter(function(v){ return !isNaN(v); });

      var pulRecent = pulStats.filter(function(s) {
        return self._day(self._ts(s)) >= cutStr;
      }).map(function(s){ return s.mean != null ? s.mean : s.state; }).filter(function(v){ return !isNaN(v); });

      var avg = function(arr) { return arr.length ? Math.round(arr.reduce(function(a,b){return a+b;},0)/arr.length) : '—'; };
      var mn  = function(arr) { return arr.length ? Math.round(Math.min.apply(null,arr)) : '—'; };
      var mx  = function(arr) { return arr.length ? Math.round(Math.max.apply(null,arr)) : '—'; };

      var alertHtml = '';
      var alertClass = 'ok';
      var alertText  = 'Ci&#347;nienie w normie';
      if (catNow) {
        var cat = catNow.toLowerCase();
        if (cat.includes('wysok') || cat.includes('high') || cat.includes('nadci')) {
          alertClass = 'danger'; alertText = '&#9888; ' + catNow;
        } else if (cat.includes('podwy') || cat.includes('elevated') || cat.includes('pre')) {
          alertClass = 'warn'; alertText = '&#9888; ' + catNow;
        } else {
          alertClass = 'ok'; alertText = '&#10003; ' + catNow;
        }
      } else if (typeof sysNow === 'number' && typeof diaNow === 'number') {
        if (sysNow >= 140 || diaNow >= 90) {
          alertClass = 'danger'; alertText = '&#9888; Nadci&#347;nienie';
        } else if (sysNow >= 130 || diaNow >= 80) {
          alertClass = 'warn'; alertText = '&#9888; Podwy&#380;szone';
        }
      }
      alertHtml = '<div class="bp-alert ' + alertClass + '">' + alertText + '</div>';

      var sysColor = (typeof sysNow === 'number' && sysNow >= 140) ? '#E24B4A' : (sysNow >= 130 ? '#BA7517' : '#1D9E75');
      var diaColor = (typeof diaNow === 'number' && diaNow >= 90)  ? '#E24B4A' : (diaNow >= 80  ? '#BA7517' : '#1D9E75');
      var pulColor = (typeof pulNow === 'number' && (pulNow > 100 || pulNow < 50)) ? '#BA7517' : '#3B8BD4';

      var sysDaily = self._statToDaily(sysStats);
      var diaDaily = self._statToDaily(diaStats);
      var pulDaily = self._statToDaily(pulStats);
      var labels = sysDaily.map(function(d){ return d[0]; });

      page.innerHTML =
        alertHtml +
        '<div class="bp-grid">' +
          '<div class="bp-metric"><div class="bp-label">Skurczowe</div><div class="bp-value" style="color:' + sysColor + '">' + sysNow + '<span class="bp-unit">mmHg</span></div></div>' +
          '<div class="bp-metric"><div class="bp-label">Rozkurczowe</div><div class="bp-value" style="color:' + diaColor + '">' + diaNow + '<span class="bp-unit">mmHg</span></div></div>' +
          '<div class="bp-metric"><div class="bp-label">Puls</div><div class="bp-value" style="color:' + pulColor + '">' + pulNow + '<span class="bp-unit">bpm</span></div></div>' +
        '</div>' +
        '<h3>&#128202; Statystyki (30 dni)</h3>' +
        '<div class="bp-stats">' +
          '<div class="bp-stat"><div class="bp-stat-label">&#216; Skurczowe</div><div class="bp-stat-val">' + avg(sysRecent) + ' mmHg</div></div>' +
          '<div class="bp-stat"><div class="bp-stat-label">Min / Max</div><div class="bp-stat-val">' + mn(sysRecent) + ' / ' + mx(sysRecent) + '</div></div>' +
          '<div class="bp-stat"><div class="bp-stat-label">&#216; Rozkurczowe</div><div class="bp-stat-val">' + avg(diaRecent) + ' mmHg</div></div>' +
          '<div class="bp-stat"><div class="bp-stat-label">Min / Max</div><div class="bp-stat-val">' + mn(diaRecent) + ' / ' + mx(diaRecent) + '</div></div>' +
          '<div class="bp-stat"><div class="bp-stat-label">&#216; Puls</div><div class="bp-stat-val">' + avg(pulRecent) + ' bpm</div></div>' +
          '<div class="bp-stat"><div class="bp-stat-label">Min / Max</div><div class="bp-stat-val">' + mn(pulRecent) + ' / ' + mx(pulRecent) + '</div></div>' +
        '</div>' +
        '<div class="report-period">' + 'Okres raportu: ' + '<select id="report-period-select">' + '<option value="7">Ostatnie 7 dni</option>' + '<option value="14">Ostatnie 14 dni</option>' + '<option value="30" selected>Ostatnie 30 dni</option>' + '<option value="90">Ostatnie 90 dni</option>' + '</select>' + '</div>' + '<button class="report-btn" id="btn-gen-pdf">&#128196; Generuj raport PDF</button>' + '<h3>&#128200; Historia (90 dni)</h3>' +
        '<div class="chart-wrap"><canvas id="bpChart"></canvas></div>';

      self._drawBpChart(labels, sysDaily, diaDaily, pulDaily);
      var pdfBtn = self.shadowRoot.getElementById('btn-gen-pdf');
      if (pdfBtn) pdfBtn.addEventListener('click', function() { self._generateBpPdf(); });

    } catch(err) {
      page.innerHTML = '<div style="color:#E24B4A;padding:20px">B&#322;&#261;d: ' + err.message + '</div>';
    }
  }

  // --- TUTAJ ZMIENIONA FUNKCJA GENEROWANIA PDF (POBIERA REALNĄ HISTORIĘ) ---
  async _generateBpPdf() {
    var self    = this;
    var select  = this.shadowRoot.getElementById('report-period-select');
    var days    = select ? parseInt(select.value) : 30;
    var now     = new Date();
    var start   = new Date(now);
    start.setDate(start.getDate() - days);
    var startStr = start.toLocaleDateString('pl-PL');
    var endStr   = now.toLocaleDateString('pl-PL');

    // Używamy history/period zamiast statistics, aby dostać surowe punkty pomiarowe
    const fetchHist = async (ent) => await this._hass.callApi('GET', `history/period/${start.toISOString()}?filter_entity_id=${ent}&end_time=${now.toISOString()}`);

    try {
      const results = await Promise.all([
        fetchHist(this.config.bp_systolic),
        fetchHist(this.config.bp_diastolic),
        fetchHist(this.config.bp_pulse)
      ]);

      var tsMap = new Map();
      const process = (data, key) => {
        if (!data[0]) return;
        data[0].forEach(s => {
          const d = new Date(s.last_changed);
          const ts = d.setSeconds(d.getSeconds(), 0); // Używamy pełnej precyzji do grupowania
          if (!tsMap.has(ts)) tsMap.set(ts, { ts, sys:null, dia:null, pul:null });
          tsMap.get(ts)[key] = Math.round(parseFloat(s.state));
        });
      };

      process(results[0], 'sys');
      process(results[1], 'dia');
      process(results[2], 'pul');

      var measurements = Array.from(tsMap.values())
        .filter(m => m.sys && m.dia)
        .sort((a,b) => a.ts - b.ts);

      var catLabel = function(s, d) {
        if (s < 120 && d < 80)  return 'Optymalne';
        if (s < 130 && d < 85)  return 'Prawidłowe';
        if (s < 140 && d < 90)  return 'Wysokie prawidłowe';
        if (s < 160 && d < 100) return 'Nadciśnienie I°';
        return 'Nadciśnienie';
      };

      var timeOfDay = function(ts) {
        var h = new Date(ts).getHours();
        if (h >= 5  && h < 12) return 'Rano';
        if (h >= 12 && h < 17) return 'Południe';
        if (h >= 17 && h < 21) return 'Wieczór';
        return 'Noc';
      };

      var rows = measurements.map(m => {
        var d = new Date(m.ts);
        return `<tr>
          <td>${d.toLocaleDateString('pl-PL')}</td>
          <td>${d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</td>
          <td>${timeOfDay(m.ts)}</td>
          <td style="font-weight:700; color:${m.sys>=140?'#c0392b':'#27ae60'}">${m.sys}</td>
          <td style="font-weight:700; color:${m.dia>=90?'#c0392b':'#27ae60'}">${m.dia}</td>
          <td>${m.pul || '—'}</td>
          <td>${catLabel(m.sys, m.dia)}</td>
        </tr>`;
      }).reverse().join('');

      var sysList = measurements.map(m => m.sys);
      var diaList = measurements.map(m => m.dia);
      var pulList = measurements.filter(m => m.pul).map(m => m.pul);
      var avg = (a) => a.length ? (a.reduce((x,y)=>x+y,0)/a.length).toFixed(1) : '—';

      var html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        body{font-family:Arial,sans-serif; font-size:13px; padding:20px; color:#333;}
        h1{text-align:center; text-transform:uppercase; font-size:16px; margin-bottom:20px;}
        .info{margin-bottom:20px;}
        table{width:100%; border-collapse:collapse; margin-bottom:20px;}
        th{background:#1a5276; color:white; padding:8px; font-size:12px;}
        td{padding:8px; border-bottom:1px solid #eee; text-align:center;}
        tr:nth-child(even){background:#f9f9f9;}
        .stat-table{border:2px solid #1a5276; margin-top:20px;}
        .footer{font-size:10px; color:#888; text-align:center; margin-top:30px;}
      </style></head><body>
        <h1>RAPORT POMIARÓW CIŚNIENIA TĘTNICZEGO</h1>
        <div class="info">
          <b>Pacjent:</b> ${this.config.report_name} | <b>Okres:</b> ${startStr} - ${endStr}<br>
          <b>Urządzenie:</b> ${this.config.report_device}
        </div>
        <table><thead><tr><th>Data</th><th>Czas</th><th>Pora</th><th>SYS</th><th>DIA</th><th>Puls</th><th>Kategoria</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <table class="stat-table">
          <thead><tr><th>Parametr</th><th>Średnia</th><th>Min</th><th>Max</th><th>Ocena</th></tr></thead>
          <tbody>
            <tr><td>Skurczowe</td><td>${avg(sysList)}</td><td>${Math.min(...sysList)}</td><td>${Math.max(...sysList)}</td><td rowspan="2">${catLabel(parseFloat(avg(sysList)), parseFloat(avg(diaList)))}</td></tr>
            <tr><td>Rozkurczowe</td><td>${avg(diaList)}</td><td>${Math.min(...diaList)}</td><td>${Math.max(...diaList)}</td></tr>
          </tbody>
        </table>
        <div class="footer">Wygenerowano: ${now.toLocaleString('pl-PL')} | Liczba pomiarów: ${measurements.length}</div>
      </body></html>`;

      var win = window.open('','_blank');
      win.document.write(html); win.document.close();
      win.onload = function() { win.print(); };
    } catch(err) { console.error(err); }
  }

  _statToDaily(stats) {
    var map  = new Map();
    for (var i = 0; i < stats.length; i++) {
      var s   = stats[i];
      var val = s.mean != null ? s.mean : s.state;
      if (val == null || isNaN(val)) continue;
      var day = this._day(this._ts(s));
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(parseFloat(val));
    }
    return Array.from(map.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(e => {
      var avg = e[1].reduce((a,b) => a+b, 0) / e[1].length;
      return [e[0], Math.round(avg * 10) / 10];
    });
  }

  async _fetchStatsByEntity(entityId, startDate, endDate, period) {
    if (!entityId) return {};
    return this._hass.connection.sendMessagePromise({
      type:           'recorder/statistics_during_period',
      start_time:    startDate.toISOString(),
      end_time:      endDate.toISOString(),
      statistic_ids: [entityId],
      period:        period,
      types:         ['mean', 'state'],
    });
  }

  _drawBpChart(labels, sysDaily, diaDaily, pulDaily) {
    var self = this;
    var draw = function() {
      var canvas = self.shadowRoot.getElementById('bpChart');
      if (!canvas) return;
      new window.Chart(canvas, {
        data: {
          labels: labels,
          datasets: [
            { type: 'line', label: 'Skurczowe', data: sysDaily.map(d => d[1]), borderColor: '#E24B4A', tension: 0.3, fill: false },
            { type: 'line', label: 'Rozkurczowe', data: diaDaily.map(d => d[1]), borderColor: '#3B8BD4', tension: 0.3, fill: false },
            { type: 'line', label: 'Puls', data: pulDaily.map(d => d[1]), borderColor: '#1D9E75', tension: 0.3, fill: false }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 40, max: 200 } } }
      });
    };
    if (window.Chart) draw(); else setTimeout(draw, 500);
  }

  _drawChart(labels, weights, trend) {
    var self = this;
    if (window.Chart) { this._initChart(labels, weights, trend); }
    else {
      var s  = document.createElement('script');
      s.src  = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
      s.onload = function() { self._initChart(labels, weights, trend); };
      document.head.appendChild(s);
    }
  }

  _initChart(labels, weights, trend) {
    var canvas = this.shadowRoot.getElementById('wChart');
    if (!canvas) return;
    this._chart = new window.Chart(canvas, {
      data: {
        labels: labels,
        datasets: [
          { type: 'line', label: 'Waga', data: weights, borderColor: '#378ADD', fill: true, backgroundColor: 'rgba(55,138,221,0.08)', tension: 0.3 },
          { type: 'line', label: 'Trend', data: trend, borderColor: '#1D9E75', borderWidth: 2.5, pointRadius: 0, tension: 0.4 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  _switchTab(tab) {
    var r = this.shadowRoot;
    r.getElementById('tab-monthly').classList.toggle('active', tab === 'monthly');
    r.getElementById('tab-weekly').classList.toggle('active', tab === 'weekly');
    r.getElementById('bal-monthly').style.display = tab === 'monthly' ? '' : 'none';
    r.getElementById('bal-weekly').style.display  = tab === 'weekly'  ? '' : 'none';
  }

  _switchRange(range) {
    var r = this.shadowRoot;
    ['all','6m','3m','30d','14d','7d'].forEach(x => r.getElementById('range-'+x)?.classList.toggle('active', x===range));
    this._loadData();
  }

  getCardSize() { return 12; }
}

customElements.define('health-card', HealthCard);