class HealthCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._loaded          = false;
    this._chart           = null;
    this._daily           = [];
    this._stepsChart      = null;
    this._calChart        = null;
    this._activityLoaded  = false;
    this._activityDays    = 30;
  }

  setConfig(config) {
    this.config = {
      entity_id:        config.entity_id        || 'sensor.weight',
      start_weight:     config.start_weight     || 100.0,
      start_date:       config.start_date       || '2025-01-01',
      height_cm_entity: config.height_cm_entity || 'input_number.wzrost_grzegorz',
      height_cm:        config.height_cm        || 175,
      history_days:     config.history_days     || 365,
      goals:            config.goals            || [],
      bp_systolic:      config.bp_systolic      || 'sensor.bp_grzegorz_skurczowe',
      bp_diastolic:     config.bp_diastolic     || 'sensor.bp_grzegorz_rozkurczowe',
      bp_pulse:         config.bp_pulse         || 'sensor.bp_grzegorz_puls',
      bp_systolic_now:  config.bp_systolic_now  || 'input_number.bp_grzegorz_systolic',
      bp_diastolic_now: config.bp_diastolic_now || 'input_number.bp_grzegorz_diastolic',
      bp_pulse_now:     config.bp_pulse_now     || 'input_number.bp_grzegorz_pulse',
      bp_category:      config.bp_category      || 'sensor.grzegorz_kategoria_cisnienia',
      bp_enabled:       config.bp_enabled !== false,
      steps_entity:    config.steps_entity    || '',
      calories_entity: config.calories_entity || '',
      steps_goal:      config.steps_goal      || 10000,
      calories_goal:   config.calories_goal   || 800,
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
    if (bmi < 35.0) return { label: 'Otyłość I°',   color: '#E24B4A' };
    if (bmi < 40.0) return { label: 'Otyłość II°',  color: '#A32D2D' };
    return           { label: 'Otyłość III°', color: '#701515' };
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
        .de-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 14px; }
        .de-grid-1 { display: grid; grid-template-columns: 1fr; max-width: 180px; margin-bottom: 14px; }
        .de-field { background: var(--secondary-background-color); border-radius: 12px; padding: 14px 10px 10px; text-align: center; }
        .de-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 10px; }
        .de-label small { display: block; font-size: 10px; margin-top: 2px; }
        .de-input { background: transparent; border: none; border-bottom: 1.5px solid rgba(255,255,255,0.2); color: var(--primary-text-color); font-size: 30px; font-weight: 500; width: 100%; text-align: center; padding: 4px 0; font-family: inherit; -moz-appearance: textfield; }
        .de-input::-webkit-outer-spin-button, .de-input::-webkit-inner-spin-button { -webkit-appearance: none; }
        .de-input:focus { outline: none; border-bottom-color: var(--primary-color, #1D9E75); }
        .de-input.invalid { border-bottom-color: #E24B4A; color: #E24B4A; }
        .de-status { font-size: 12px; margin-top: 8px; padding: 8px 12px; border-radius: 8px; display: none; }
        .de-status.ok  { display: block; background: #E1F5EE; color: #0F6E56; }
        .de-status.err { display: block; background: #FCEBEB; color: #A32D2D; }

      </style>
      <ha-card>
        <div id="wrap">
          <div class="nav" id="health-nav">
            <button class="nav-btn active" data-page="weight">&#9878; Waga</button>
            <button class="nav-btn" data-page="pressure">&#128138; Ci&#347;nienie</button>
            <button class="nav-btn" data-page="activity">&#127939; Aktywno&#347;&#263;</button>
            <button class="nav-btn" data-page="settings">&#9998; Wprowad&#378; dane</button>
          </div>
          <div id="content"><div class="loading">Ładowanie danych...</div></div>
          <div id="page-pressure" class="nav-page" style="display:none"></div>
          <div id="page-activity" class="nav-page" style="display:none"></div>
          <div id="page-settings" class="nav-page" style="display:none"></div>
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
    // Podepnij event listener do nawigacji
    var nav = this.shadowRoot.getElementById('health-nav');
    if (nav) {
      var self = this;
      nav.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-page]');
        if (btn) self._switchPage(btn.getAttribute('data-page'));
      });
    }
    this._applyNavVisibility();

  }

  _switchPage(page) {
    var self = this;
    if (page === 'pressure' && !this._pressureLoaded) {
      this._pressureLoaded = true;
      this._loadPressureData();
    }
    if (page === 'activity' && !this._activityLoaded) {
      this._activityLoaded = true;
      this._loadActivityData(this._activityDays);
    }
    if (page === 'settings') {
      this._renderSettings();
    }
    var r = this.shadowRoot;
    var pages = ['weight', 'pressure', 'activity', 'settings'];
    // Pokaż/ukryj odpowiednie strony
    var content = r.getElementById('content');
    if (content) content.style.display = page === 'weight' ? '' : 'none';
    ['pressure', 'activity', 'settings'].forEach(function(p) {
      var el = r.getElementById('page-' + p);
      if (el) el.style.display = p === page ? 'block' : 'none';
    });
    // Zaktualizuj aktywny przycisk nawigacji
    var nav = r.getElementById('health-nav');
    if (nav) {
      nav.querySelectorAll('.nav-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-page') === page);
      });
    }
    // Widoczność zakładki Ciśnienie
    this._applyNavVisibility();
  }

  _applyNavVisibility() {
    var nav = this.shadowRoot.getElementById('health-nav');
    if (!nav) return;
    var btn = nav.querySelector('[data-page="pressure"]');
    if (btn) btn.style.display = this.config.bp_enabled ? '' : 'none';
  }

  _renderSettings() {
    var page = this.shadowRoot.getElementById('page-settings');
    if (!page) return;
    var self = this;
    var cfg  = this.config;

    var val = function(entityId) {
      var s = self._hass && self._hass.states[entityId];
      return (s && !isNaN(parseFloat(s.state))) ? Math.round(parseFloat(s.state)) : '';
    };

    var field = function(id, label, unit, entityId, min, max) {
      return '<div class="de-field">'
        + '<div class="de-label">' + label + '<small>' + unit + '</small></div>'
        + '<input class="de-input" id="' + id + '" type="number" min="' + min + '" max="' + max + '" value="' + val(entityId) + '" placeholder="—">'
        + '</div>';
    };

    page.innerHTML =
      '<h3>&#128138; Ci&#347;nienie krwi</h3>'
      + '<div class="de-grid">'
      +   field('de-sys', 'Skurczowe',   'mmHg', cfg.bp_systolic_now,  60,  250)
      +   field('de-dia', 'Rozkurczowe', 'mmHg', cfg.bp_diastolic_now, 40,  150)
      +   field('de-pul', 'Puls',        'bpm',  cfg.bp_pulse_now,     30,  200)
      + '</div>'
      + '<button class="report-btn" id="de-save-bp">&#128190; Zapisz ci&#347;nienie</button>'
      + '<div class="de-status" id="de-status-bp"></div>'
      + '<h3>&#128207; Wzrost</h3>'
      + '<div class="de-grid-1">'
      +   field('de-height', 'Wzrost', 'cm', cfg.height_cm_entity, 100, 250)
      + '</div>'
      + '<button class="report-btn" id="de-save-height">&#128190; Zapisz wzrost</button>'
      + '<div class="de-status" id="de-status-height"></div>';

    page.querySelector('#de-save-bp').addEventListener('click',     function() { self._saveBloodPressure(); });
    page.querySelector('#de-save-height').addEventListener('click', function() { self._saveHeight(); });
  }

  _saveBloodPressure() {
    var r   = this.shadowRoot;
    var num = function(id) { var el = r.getElementById(id); return el ? parseInt(el.value) : NaN; };
    var st  = r.getElementById('de-status-bp');

    var sys = num('de-sys'), dia = num('de-dia'), pul = num('de-pul');

    // Wyczyść poprzednie podświetlenia
    ['de-sys','de-dia','de-pul'].forEach(function(id) {
      var el = r.getElementById(id); if (el) el.classList.remove('invalid');
    });

    var missing = [];
    if (isNaN(sys)) missing.push('de-sys');
    if (isNaN(dia)) missing.push('de-dia');
    if (isNaN(pul)) missing.push('de-pul');
    if (missing.length) {
      missing.forEach(function(id) { var el = r.getElementById(id); if (el) el.classList.add('invalid'); });
      if (st) { st.textContent = '\u26a0 Wype\u0142nij wszystkie trzy warto\u015bci.'; st.className = 'de-status err'; }
      return;
    }

    var cfg  = this.config;
    var self = this;
    Promise.all([
      this._hass.callService('input_number', 'set_value', { entity_id: cfg.bp_systolic_now,  value: sys }),
      this._hass.callService('input_number', 'set_value', { entity_id: cfg.bp_diastolic_now, value: dia }),
      this._hass.callService('input_number', 'set_value', { entity_id: cfg.bp_pulse_now,     value: pul }),
    ]).then(function() {
      if (st) { st.textContent = '\u2713 Zapisano: ' + sys + '/' + dia + ' mmHg, puls ' + pul + ' bpm'; st.className = 'de-status ok'; }
      // Odśwież zakładkę Ciśnienie
      self._pressureLoaded = false;
    }).catch(function(e) {
      if (st) { st.textContent = '\u26a0 B\u0142\u0105d: ' + e.message; st.className = 'de-status err'; }
    });
  }

  _saveHeight() {
    var r   = this.shadowRoot;
    var el  = r.getElementById('de-height');
    var st  = r.getElementById('de-status-height');
    var val = el ? parseInt(el.value) : NaN;

    if (el) el.classList.remove('invalid');
    if (isNaN(val) || val < 100 || val > 250) {
      if (el) el.classList.add('invalid');
      if (st) { st.textContent = '\u26a0 Podaj prawid\u0142ow\u0105 warto\u015b\u0107 (100\u2013250 cm).'; st.className = 'de-status err'; }
      return;
    }

    this._hass.callService('input_number', 'set_value', {
      entity_id: this.config.height_cm_entity,
      value:     val,
    }).then(function() {
      if (st) { st.textContent = '\u2713 Zapisano wzrost: ' + val + ' cm'; st.className = 'de-status ok'; }
    }).catch(function(e) {
      if (st) { st.textContent = '\u26a0 B\u0142\u0105d: ' + e.message; st.className = 'de-status err'; }
    });
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

      // Pobierz aktualne wartości — preferuj input_number (ręczny wpis), fallback na sensor
      var _st = function(id) { return id ? this._hass.states[id] : null; }.bind(this);
      var sysStateNow = _st(this.config.bp_systolic_now) || _st(this.config.bp_systolic);
      var diaStateNow = _st(this.config.bp_diastolic_now) || _st(this.config.bp_diastolic);
      var pulStateNow = _st(this.config.bp_pulse_now)    || _st(this.config.bp_pulse);
      var catState    = this.config.bp_category ? this._hass.states[this.config.bp_category] : null;

      var sysNow = sysStateNow ? Math.round(parseFloat(sysStateNow.state)) : '—';
      var diaNow = diaStateNow ? Math.round(parseFloat(diaStateNow.state)) : '—';
      var pulNow = pulStateNow ? Math.round(parseFloat(pulStateNow.state)) : '—';
      var catNow = catState ? catState.state : null;

      // Statystyki z ostatnich 30 dni
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

      // Alert na podstawie kategorii lub wartości
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
          alertClass = 'danger'; alertText = '&#9888; Nadci&#347;nienie — skonsultuj si&#281; z lekarzem';
        } else if (sysNow >= 130 || diaNow >= 80) {
          alertClass = 'warn'; alertText = '&#9888; Podwy&#380;szone ci&#347;nienie';
        }
      }
      alertHtml = '<div class="bp-alert ' + alertClass + '">' + alertText + '</div>';

      // Kolory wartości
      var sysColor = (typeof sysNow === 'number' && sysNow >= 140) ? '#E24B4A' : (sysNow >= 130 ? '#BA7517' : '#1D9E75');
      var diaColor = (typeof diaNow === 'number' && diaNow >= 90)  ? '#E24B4A' : (diaNow >= 80  ? '#BA7517' : '#1D9E75');
      var pulColor = (typeof pulNow === 'number' && (pulNow > 100 || pulNow < 50)) ? '#BA7517' : '#3B8BD4';

      // Dane wykresu — dzienne średnie
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
      // Podepnij przycisk PDF
      var pdfBtn = self.shadowRoot.getElementById('btn-gen-pdf');
      if (pdfBtn) pdfBtn.addEventListener('click', function() { self._generateBpPdf(); });

    } catch(err) {
      page.innerHTML = '<div style="color:#E24B4A;padding:20px">B&#322;&#261;d: ' + err.message + '</div>';
    }
  }

  _statToDaily(stats) {
    var self = this;
    var map  = new Map();
    for (var i = 0; i < stats.length; i++) {
      var s   = stats[i];
      var val = s.mean != null ? s.mean : s.state;
      if (val == null || isNaN(val)) continue;
      var day = this._day(this._ts(s));
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(parseFloat(val));
    }
    return Array.from(map.entries()).sort(function(a,b){ return a[0].localeCompare(b[0]); }).map(function(e){
      var avg = e[1].reduce(function(a,b){return a+b;},0) / e[1].length;
      return [e[0], Math.round(avg * 10) / 10];
    });
  }

  async _fetchStatsByEntity(entityId, startDate, endDate, period) {
    if (!entityId) return {};
    return this._hass.connection.sendMessagePromise({
      type:          'recorder/statistics_during_period',
      start_time:    startDate.toISOString(),
      end_time:      endDate.toISOString(),
      statistic_ids: [entityId],
      period:        period,
      units:         {},
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
            {
              type: 'line', label: 'Skurczowe',
              data: sysDaily.map(function(d){ return d[1]; }),
              borderColor: '#E24B4A', backgroundColor: 'rgba(226,75,74,0.08)',
              borderWidth: 2, pointRadius: 2, tension: 0.3, fill: false, order: 1
            },
            {
              type: 'line', label: 'Rozkurczowe',
              data: diaDaily.map(function(d){ return d[1]; }),
              borderColor: '#3B8BD4', backgroundColor: 'rgba(59,139,212,0.08)',
              borderWidth: 2, pointRadius: 2, tension: 0.3, fill: false, order: 2
            },
            {
              type: 'line', label: 'Puls',
              data: pulDaily.map(function(d){ return d[1]; }),
              borderColor: '#1D9E75', borderWidth: 1.5, pointRadius: 2,
              tension: 0.3, fill: false, order: 3
            },
            {
              type: 'line', label: 'Norma sys 120',
              data: labels.map(function(){ return 120; }),
              borderColor: '#E24B4A', borderWidth: 1, borderDash: [4,3],
              pointRadius: 0, fill: false, order: 4
            },
            {
              type: 'line', label: 'Norma dia 80',
              data: labels.map(function(){ return 80; }),
              borderColor: '#3B8BD4', borderWidth: 1, borderDash: [4,3],
              pointRadius: 0, fill: false, order: 5
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.parsed.y + (ctx.datasetIndex < 2 ? ' mmHg' : ctx.datasetIndex === 2 ? ' bpm' : ''); } } }
          },
          scales: {
            x: { ticks: { maxTicksLimit: 8, color: '#73726c', font: { size: 11 }, maxRotation: 30 }, grid: { display: false } },
            y: { min: 40, max: 200, ticks: { color: '#73726c', font: { size: 11 }, stepSize: 20 }, grid: { color: 'rgba(128,128,128,0.1)' } }
          }
        }
      });
    };
    if (window.Chart) draw(); else setTimeout(draw, 500);
  }

  _generateBpPdf() {
    var self   = this;
    var select = this.shadowRoot.getElementById('report-period-select');
    var days   = select ? parseInt(select.value) : 30;
    var now    = new Date();
    var start  = new Date(now);
    start.setDate(start.getDate() - days);
    var startStr = start.toLocaleDateString('pl-PL');
    var endStr   = now.toLocaleDateString('pl-PL');

    // Pobierz rzeczywiste pomiary z historii stanów (nie ze statystyk)
    this._hass.connection.sendMessagePromise({
      type:                    'history/history_during_period',
      start_time:              start.toISOString(),
      end_time:                now.toISOString(),
      entity_ids:              [this.config.bp_systolic, this.config.bp_diastolic, this.config.bp_pulse],
      no_attributes:           true,
      significant_changes_only: false,
    }).then(function(histData) {

      function parseHist(entries) {
        return (entries || [])
          .filter(function(e) { return e.s && !isNaN(parseFloat(e.s)); })
          .map(function(e) {
            var ts = e.lc != null ? Math.round(e.lc * 1000)
                   : e.lu != null ? Math.round(e.lu * 1000) : 0;
            return { ts: ts, val: Math.round(parseFloat(e.s)) };
          })
          .filter(function(e) { return e.ts > 0; })
          .sort(function(a, b) { return a.ts - b.ts; });
      }

      var sysHist = parseHist(histData[self.config.bp_systolic]);
      var diaHist = parseHist(histData[self.config.bp_diastolic]);
      var pulHist = parseHist(histData[self.config.bp_pulse]);

      // Dopasuj sys/dia/pul do tego samego pomiaru (okno ±60 s)
      var WINDOW = 60000;
      var measurements = [];
      sysHist.forEach(function(sys) {
        var dia = diaHist.reduce(function(b, d) {
          if (!b) return d;
          return Math.abs(d.ts - sys.ts) < Math.abs(b.ts - sys.ts) ? d : b;
        }, null);
        var pul = pulHist.reduce(function(b, p) {
          if (!b) return p;
          return Math.abs(p.ts - sys.ts) < Math.abs(b.ts - sys.ts) ? p : b;
        }, null);
        if (dia && Math.abs(dia.ts - sys.ts) <= WINDOW) {
          measurements.push({
            ts:  sys.ts,
            sys: sys.val,
            dia: dia.val,
            pul: (pul && Math.abs(pul.ts - sys.ts) <= WINDOW) ? pul.val : null,
          });
        }
      });

      // Krok 1: usuń wpisy bliżej niż 2 minuty od poprzedniego
      measurements = measurements.filter(function(m, i) {
        return i === 0 || m.ts - measurements[i - 1].ts >= 120000;
      });

      // Krok 2: usuń duplikaty wartości — HA czasem ponownie odczytuje ostatni
      // pomiar z urządzenia; jeśli te same sys/dia/pul pojawiły się w ciągu 6h, pomijamy
      var lastSeen = new Map();
      measurements = measurements.filter(function(m) {
        var key = m.sys + '/' + m.dia + '/' + (m.pul != null ? m.pul : '');
        var lastTs = lastSeen.get(key);
        if (lastTs != null && m.ts - lastTs < 6 * 3600 * 1000) return false;
        lastSeen.set(key, m.ts);
        return true;
      });

      var sysList = measurements.map(function(m) { return m.sys; });
      var diaList = measurements.map(function(m) { return m.dia; });
      var pulList = measurements.filter(function(m) { return m.pul != null; }).map(function(m) { return m.pul; });

      var avg = function(a) {
        return a.length ? Math.round(a.reduce(function(x, y) { return x + y; }, 0) / a.length * 10) / 10 : '\u2014';
      };
      var mn = function(a) { return a.length ? Math.min.apply(null, a) : '\u2014'; };
      var mx = function(a) { return a.length ? Math.max.apply(null, a) : '\u2014'; };

      var catLabel = function(s, d) {
        if (s < 120 && d < 80)  return 'Optymalne';
        if (s < 130 && d < 85)  return 'Prawid\u0142owe';
        if (s < 140 && d < 90)  return 'Wysokie prawid\u0142owe';
        if (s < 160 && d < 100) return 'Nadci\u015bnienie I\u00b0';
        if (s < 180 && d < 110) return 'Nadci\u015bnienie II\u00b0';
        return 'Nadci\u015bnienie III\u00b0';
      };

      var timeOfDay = function(ts) {
        var h = new Date(ts).getHours();
        if (h >= 5  && h < 12) return 'Rano';
        if (h >= 12 && h < 17) return 'Po\u0142udnie';
        if (h >= 17 && h < 21) return 'Wieczór';
        return 'Noc';
      };

      var ageStr = '';
      if (self.config.report_birthdate) {
        var bd  = new Date(self.config.report_birthdate);
        var age = Math.floor((now - bd) / (365.25 * 24 * 3600 * 1000));
        ageStr  = bd.toLocaleDateString('pl-PL') + '\u00a0\u00a0(wiek: ' + age + ' lat)';
      }

      var sysAvg = avg(sysList);
      var diaAvg = avg(diaList);
      var pulAvg = avg(pulList);
      var overallCat = (typeof sysAvg === 'number' && typeof diaAvg === 'number')
        ? catLabel(sysAvg, diaAvg) : '\u2014';
      var overallPul = (typeof pulAvg === 'number')
        ? (pulAvg >= 60 && pulAvg <= 100 ? 'Prawid\u0142owy' : 'Nieprawid\u0142owy') : '\u2014';

      var rows = measurements.map(function(m) {
        var d = new Date(m.ts);
        return '<tr>'
          + '<td>' + d.toLocaleDateString('pl-PL') + '</td>'
          + '<td>' + d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) + '</td>'
          + '<td>' + timeOfDay(m.ts) + '</td>'
          + '<td>' + m.sys + '</td>'
          + '<td>' + (m.dia != null ? m.dia : '\u2014') + '</td>'
          + '<td>' + (m.pul != null ? m.pul : '\u2014') + '</td>'
          + '<td>' + catLabel(m.sys, m.dia || 0) + '</td>'
          + '</tr>';
      }).join('');

      var weightState = self._hass.states[self.config.entity_id];
      var weightStr   = weightState ? parseFloat(weightState.state).toFixed(1) : '\u2014';

      var html = '<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8">'
        + '<title>Raport ci\u015bnienia \u2014 ' + self.config.report_name + '</title>'
        + '<style>'
        + 'body{font-family:Arial,sans-serif;font-size:13px;color:#333;margin:0;padding:24px 32px;}'
        + 'h1{text-align:center;font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:22px;}'
        + '.info-table{width:100%;border-collapse:collapse;margin-bottom:24px;}'
        + '.info-table td{padding:4px 8px;}'
        + '.info-table td:first-child{font-weight:700;width:170px;}'
        + 'h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;'
        +    'color:#1a5276;border-bottom:2px solid #1a5276;padding-bottom:3px;margin:20px 0 10px;}'
        + '.data-table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px;}'
        + '.data-table thead th{padding:8px 6px;text-align:center;font-size:11px;font-weight:600;'
        +    'color:#555;background:#f0f0f0;border:1px solid #ddd;}'
        + '.data-table tbody td{padding:6px 8px;text-align:center;border:1px solid #e0e0e0;color:#333;}'
        + '.data-table tbody tr:nth-child(even){background:#f7f7f7;}'
        + '.stat-table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px;}'
        + '.stat-table thead th{padding:8px 10px;text-align:center;background:#2e86c1;color:#fff;font-size:12px;}'
        + '.stat-table tbody td{padding:6px 10px;text-align:center;border-bottom:1px solid #dce9f5;}'
        + '.stat-table tbody tr:nth-child(odd){background:#eaf4fb;}'
        + '.footer{font-size:10px;color:#888;text-align:center;margin-top:30px;'
        +    'border-top:1px solid #eee;padding-top:8px;font-style:italic;}'
        + '@media print{body{padding:10px;}}'
        + '</style></head><body>'
        + '<h1>Raport pomiar\u00f3w ci\u015bnienia t\u0119tniczego</h1>'
        + '<table class="info-table"><tbody>'
        + '<tr><td>Imi\u0119 i nazwisko:</td><td>' + self.config.report_name + '</td></tr>'
        + (ageStr ? '<tr><td>Data urodzenia:</td><td>' + ageStr + '</td></tr>' : '')
        + '<tr><td>Wzrost / Waga:</td><td>' + self._heightCm() + ' cm / ' + weightStr + ' kg</td></tr>'
        + '<tr><td>Okres pomiar\u00f3w:</td><td>' + startStr + ' \u2014 ' + endStr + '</td></tr>'
        + '<tr><td>Urz\u0105dzenie:</td><td>' + self.config.report_device + '</td></tr>'
        + '</tbody></table>'
        + '<h2>Wyniki pomiar\u00f3w</h2>'
        + '<table class="data-table"><thead><tr>'
        + '<th>Data</th><th>Czas</th><th>Pora</th>'
        + '<th>Skurczowe<br>(mmHg)</th><th>Rozkurczowe<br>(mmHg)</th>'
        + '<th>Puls<br>(bpm)</th><th>Kategoria</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table>'
        + '<h2>Podsumowanie statystyczne</h2>'
        + '<table class="stat-table"><thead><tr>'
        + '<th>Parametr</th><th>\u015arednia</th><th>Min</th><th>Max</th><th>Ocena</th>'
        + '</tr></thead><tbody>'
        + '<tr><td>Skurczowe (mmHg)</td><td>' + avg(sysList) + '</td><td>' + mn(sysList) + '</td><td>' + mx(sysList) + '</td><td rowspan="2">' + overallCat + '</td></tr>'
        + '<tr><td>Rozkurczowe (mmHg)</td><td>' + avg(diaList) + '</td><td>' + mn(diaList) + '</td><td>' + mx(diaList) + '</td></tr>'
        + '<tr><td>Puls (bpm)</td><td>' + avg(pulList) + '</td><td>' + mn(pulList) + '</td><td>' + mx(pulList) + '</td><td>' + overallPul + '</td></tr>'
        + '</tbody></table>'
        + '<div class="footer">Data wygenerowania: '
        + now.toLocaleDateString('pl-PL') + ' '
        + now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
        + ' | Dane pobrane z Home Assistant | Liczba pomiar\u00f3w: ' + measurements.length
        + '</div>'
        + '</body></html>';

      // Otwórz jako Blob URL — gwarantuje prawidłowe kodowanie UTF-8
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var url  = URL.createObjectURL(blob);
      var win  = window.open(url, '_blank');
      if (win) {
        win.addEventListener('load', function() {
          URL.revokeObjectURL(url);
          win.print();
        });
      }
    }).catch(function(err) {
      console.error('[health-card] PDF error:', err);
      alert('B\u0142\u0105d generowania raportu: ' + err.message);
    });
  }

  _statToDailyMax(stats) {
    var map = new Map();
    for (var i = 0; i < stats.length; i++) {
      var s   = stats[i];
      var val = s.mean != null ? s.mean : s.state;
      if (val == null || isNaN(val)) continue;
      var day = this._day(this._ts(s));
      var v   = parseFloat(val);
      if (!map.has(day) || v > map.get(day)) map.set(day, v);
    }
    return Array.from(map.entries())
      .sort(function(a, b) { return a[0].localeCompare(b[0]); })
      .map(function(e) { return [e[0], Math.round(e[1])]; });
  }

  async _loadActivityData(days) {
    var self = this;
    var page = this.shadowRoot.getElementById('page-activity');
    if (!page) return;
    this._activityDays = days || 30;
    page.innerHTML = '<div class="loading">&#321;adowanie aktywno&#347;ci...</div>';

    if (!this.config.steps_entity && !this.config.calories_entity) {
      page.innerHTML = '<div class="empty-page"><div class="icon">&#127939;</div><div class="title">Brak konfiguracji</div>'
        + '<div>Ustaw <code>steps_entity</code> lub <code>calories_entity</code> w konfiguracji karty</div></div>';
      return;
    }

    try {
      var now   = new Date();
      var start = new Date(now);
      start.setDate(start.getDate() - days);

      var fetches = [
        this.config.steps_entity    ? this._fetchStatsByEntity(this.config.steps_entity,    start, now, 'hour') : Promise.resolve({}),
        this.config.calories_entity ? this._fetchStatsByEntity(this.config.calories_entity, start, now, 'hour') : Promise.resolve({}),
      ];
      var results  = await Promise.all(fetches);
      var stepsData = this._statToDailyMax(results[0][this.config.steps_entity]    || []);
      var calData   = this._statToDailyMax(results[1][this.config.calories_entity] || []);

      var stepsState = this.config.steps_entity    ? this._hass.states[this.config.steps_entity]    : null;
      var calState   = this.config.calories_entity ? this._hass.states[this.config.calories_entity] : null;
      var stepsNow   = stepsState ? Math.round(parseFloat(stepsState.state)) : null;
      var calNow     = calState   ? Math.round(parseFloat(calState.state))   : null;

      var stepsVals = stepsData.map(function(d) { return d[1]; });
      var calVals   = calData.map(function(d) { return d[1]; });

      var avgFn = function(a) { return a.length ? Math.round(a.reduce(function(x, y) { return x + y; }, 0) / a.length) : 0; };
      var maxFn = function(a) { return a.length ? Math.max.apply(null, a) : 0; };

      var sg = self.config.steps_goal;
      var cg = self.config.calories_goal;

      var stepsAvg   = avgFn(stepsVals);
      var stepsMax   = maxFn(stepsVals);
      var calAvg     = avgFn(calVals);
      var calMax     = maxFn(calVals);

      var stepsPct   = stepsNow != null ? Math.min(100, Math.round(stepsNow / sg * 100)) : 0;
      var calPct     = calNow   != null ? Math.min(100, Math.round(calNow   / cg * 100)) : 0;
      var stepsColor = stepsNow != null ? (stepsNow >= sg ? '#1D9E75' : stepsNow >= sg * 0.5 ? '#BA7517' : '#E24B4A') : '#1D9E75';
      var calColor   = calNow   != null ? (calNow   >= cg ? '#1D9E75' : calNow   >= cg * 0.5 ? '#BA7517' : '#E24B4A') : '#1D9E75';

      var rangeTabs = [7, 14, 30, 90].map(function(d) {
        return '<div class="tab' + (d === days ? ' active' : '') + '" '
          + 'onclick="this.getRootNode().host._loadActivityData(' + d + ')">' + d + ' dni</div>';
      }).join('');

      var metricsHtml = '';
      if (stepsNow != null) {
        metricsHtml += '<div class="metric">'
          + '<div class="metric-label">Kroki dzi&#347;</div>'
          + '<div class="metric-value" style="color:' + stepsColor + '">' + stepsNow.toLocaleString('pl-PL') + '</div>'
          + '<div class="prog-bg" style="margin-top:6px"><div class="prog-fill" style="width:' + stepsPct + '%;background:' + stepsColor + '"></div></div>'
          + '<div class="metric-sub">' + stepsPct + '% celu (' + sg.toLocaleString('pl-PL') + ')</div>'
          + '</div>';
      }
      if (calNow != null) {
        metricsHtml += '<div class="metric">'
          + '<div class="metric-label">Kalorie dzi&#347;</div>'
          + '<div class="metric-value" style="color:' + calColor + '">' + calNow.toLocaleString('pl-PL') + ' kcal</div>'
          + '<div class="prog-bg" style="margin-top:6px"><div class="prog-fill" style="width:' + calPct + '%;background:' + calColor + '"></div></div>'
          + '<div class="metric-sub">' + calPct + '% celu (' + cg.toLocaleString('pl-PL') + ' kcal)</div>'
          + '</div>';
      }
      if (stepsVals.length) {
        metricsHtml += '<div class="metric">'
          + '<div class="metric-label">&#216; Kroki (' + days + ' dni)</div>'
          + '<div class="metric-value">' + stepsAvg.toLocaleString('pl-PL') + '</div>'
          + '<div class="metric-sub">Max: ' + stepsMax.toLocaleString('pl-PL') + '</div>'
          + '</div>';
      }
      if (calVals.length) {
        metricsHtml += '<div class="metric">'
          + '<div class="metric-label">&#216; Kalorie (' + days + ' dni)</div>'
          + '<div class="metric-value">' + calAvg.toLocaleString('pl-PL') + ' kcal</div>'
          + '<div class="metric-sub">Max: ' + calMax.toLocaleString('pl-PL') + ' kcal</div>'
          + '</div>';
      }

      page.innerHTML =
        '<div class="metric-grid">' + metricsHtml + '</div>'
        + '<div class="tabs">' + rangeTabs + '</div>'
        + '<div class="legend">'
        + '<span><span class="ldot" style="background:#1D9E75"></span>&#8805; cel</span>'
        + '<span><span class="ldot" style="background:#BA7517"></span>&#8805; 50% celu</span>'
        + '<span><span class="ldot" style="background:#E24B4A"></span>&lt; 50% celu</span>'
        + '</div>'
        + (stepsData.length ? '<h3>&#128099; Kroki dzienne</h3><div class="chart-wrap" style="height:200px"><canvas id="stepsChart"></canvas></div>' : '')
        + (calData.length   ? '<h3>&#128293; Kalorie dzienne</h3><div class="chart-wrap" style="height:200px"><canvas id="calChart"></canvas></div>' : '');

      self._drawActivityCharts(stepsData, calData);

    } catch(err) {
      page.innerHTML = '<div style="color:#E24B4A;padding:20px">B&#322;&#261;d: ' + err.message + '</div>';
    }
  }

  _drawActivityCharts(stepsData, calData) {
    var self = this;
    var draw = function() {
      if (self._stepsChart) { self._stepsChart.destroy(); self._stepsChart = null; }
      if (self._calChart)   { self._calChart.destroy();   self._calChart   = null; }

      var sg = self.config.steps_goal;
      var cg = self.config.calories_goal;

      function fmtLabel(dateStr) {
        var d = new Date(dateStr);
        return (d.getDate()) + '.' + (d.getMonth() + 1);
      }

      function makeBarChart(canvasId, data, goal, tooltipSuffix) {
        var canvas = self.shadowRoot.getElementById(canvasId);
        if (!canvas || !data.length) return null;
        var labels = data.map(function(d) { return fmtLabel(d[0]); });
        var vals   = data.map(function(d) { return d[1]; });
        var colors = vals.map(function(v) {
          return v >= goal ? '#1D9E75' : v >= goal * 0.5 ? '#BA7517' : '#E24B4A';
        });
        return new window.Chart(canvas, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{ data: vals, backgroundColor: colors, borderRadius: 3, borderSkipped: false }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function(ctx) { return ' ' + ctx.parsed.y.toLocaleString('pl-PL') + tooltipSuffix; }
                }
              }
            },
            scales: {
              x: {
                ticks: { maxTicksLimit: 12, color: 'var(--secondary-text-color, #888)', font: { size: 10 }, maxRotation: 0 },
                grid: { display: false },
              },
              y: {
                ticks: {
                  color: 'var(--secondary-text-color, #888)',
                  font: { size: 10 },
                  callback: function(v) { return v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : v; }
                },
                grid: { color: 'rgba(128,128,128,0.1)' },
              }
            }
          }
        });
      }

      self._stepsChart = makeBarChart('stepsChart', stepsData, sg, ' krok\u00f3w');
      self._calChart   = makeBarChart('calChart',   calData,   cg, ' kcal');
    };

    if (window.Chart) {
      draw();
    } else {
      var s  = document.createElement('script');
      s.src  = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
      s.onload = draw;
      document.head.appendChild(s);
    }
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