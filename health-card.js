var BODY_MEAS = [
  { key: 'neck',    label: 'Szyja',   min: 20, max: 80  },
  { key: 'chest',   label: 'Klatka',  min: 40, max: 160 },
  { key: 'abdomen', label: 'Brzuch',  min: 40, max: 200 },
  { key: 'waist',   label: 'Talia',   min: 40, max: 180 },
  { key: 'hips',    label: 'Biodra',  min: 40, max: 180 },
  { key: 'thigh',   label: 'Udo',     min: 20, max: 100 },
  { key: 'calf',    label: 'Łydka', min: 20, max: 80 },
  { key: 'biceps',  label: 'Biceps',  min: 10, max: 80  },
];

var MEAS_COLORS = {
  neck:    '#E24B4A',
  chest:   '#3B8BD4',
  abdomen: '#BA7517',
  waist:   '#1D9E75',
  hips:    '#9B59B6',
  thigh:   '#E67E22',
  calf:    '#16A085',
  biceps:  '#F39C12',
};

class HealthCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._loaded          = false;
    this._chart           = null;
    this._daily           = [];
    this._stepsChart      = null;
    this._calChart        = null;
    this._activityLoaded      = false;
    this._activityDays        = 30;
    this._measurementsLoaded  = false;
    this._measChart           = null;
    this._measHistChart       = null;
  }

  setConfig(config) {
    this.config = {
      entity_id:        config.entity_id        || '',
      start_weight:     config.start_weight     || 100.0,
      start_date:       config.start_date       || '2025-01-01',
      height_cm_entity: config.height_cm_entity || '',
      height_cm:        config.height_cm        || 175,
      history_days:     config.history_days     || 365,
      goals:            config.goals            || [],
      goals_enabled:    config.goals_enabled !== false,
      bp_systolic:      config.bp_systolic      || '',
      bp_diastolic:     config.bp_diastolic     || '',
      bp_pulse:         config.bp_pulse         || '',
      bp_systolic_now:  config.bp_systolic_now  || '',
      bp_diastolic_now: config.bp_diastolic_now || '',
      bp_pulse_now:     config.bp_pulse_now     || '',
      bp_category:      config.bp_category      || '',
      bp_enabled:       config.bp_enabled !== false,
      centile_enabled:    config.centile_enabled   === true,
      centile_birthdate:  config.centile_birthdate  || config.report_birthdate || '',
      centile_gender:     config.centile_gender     || 'female',
      steps_entity:    config.steps_entity    || '',
      calories_entity: config.calories_entity || '',
      steps_goal:      config.steps_goal      || 10000,
      calories_goal:   config.calories_goal   || 800,
      report_name:      config.report_name      || '',
      report_birthdate: config.report_birthdate || '',
      report_device:    config.report_device    || '',
      bp_exclude_timestamps: Array.isArray(config.bp_exclude_timestamps) ? config.bp_exclude_timestamps : [],
      measurements:         config.measurements         || {},
      measurements_enabled: config.measurements_enabled !== false,
    };

    // Resetuj flagi cache — nowa konfiguracja wymaga przeładowania danych
    this._pressureLoaded     = false;
    this._activityLoaded     = false;
    this._measurementsLoaded = false;
    this._loaded             = false;
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
      if (this._centilePending) { this._centilePending = false; this._renderCentile(); }

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
          overflow-x: clip;
          box-sizing: border-box;
        }
        .metric-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-bottom: 16px;
        }
        @media (min-width: 420px) { .metric-grid { grid-template-columns: repeat(4, 1fr); } }
        .metric { background: var(--secondary-background-color); border-radius: 12px; padding: 12px; min-width: 0; overflow: hidden; }
        .metric-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .metric-value { font-size: clamp(14px, 4vw, 20px); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .metric-value.good { color: #1D9E75; }
        .metric-sub { font-size: 11px; color: var(--secondary-text-color); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bmi-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
        .bmi-card { background: var(--secondary-background-color); border-radius: 12px; padding: 12px; }
        .bmi-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 4px; }
        .bmi-value { font-size: 20px; font-weight: 500; }
        .bmi-cat   { font-size: 12px; margin-top: 3px; font-weight: 500; }
        .bmi-bar   { margin-top: 8px; height: 6px; border-radius: 4px; overflow: hidden;
          background: linear-gradient(to right,#3B8BD4 12%,#1D9E75 12% 33%,#BA7517 33% 50%,#E24B4A 50% 67%,#A32D2D 67% 83%,#701515 83%); }
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
        .nav { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--divider-color, rgba(255,255,255,0.1)); padding-bottom: 0; position: sticky; top: 0; z-index: 10; background: var(--card-background-color, var(--ha-card-background, #1c1c1c)); }
        .nav-btn { padding: 8px 16px; font-size: 13px; cursor: pointer; background: none; border: none; color: var(--secondary-text-color); border-bottom: 2px solid transparent; margin-bottom: -1px; user-select: none; font-family: inherit; }
        .nav-btn:hover { color: var(--primary-text-color); }
        .nav-btn.active { color: var(--primary-color, #1D9E75); border-bottom-color: var(--primary-color, #1D9E75); font-weight: 500; }
        .nav-page { display: none; }
        .nav-page.active { display: block; }
        .empty-page { text-align: center; padding: 60px 20px; color: var(--secondary-text-color); font-size: 14px; }
        .empty-page .icon { font-size: 48px; margin-bottom: 12px; }
        .empty-page .title { font-size: 16px; font-weight: 500; color: var(--primary-text-color); margin-bottom: 8px; }
        .bp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
        .bp-metric { background: var(--secondary-background-color); border-radius: 12px; padding: 12px; text-align: center; min-width: 0; }
        .bp-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 4px; }
        .bp-value { font-size: clamp(18px, 6vw, 28px); font-weight: 500; }
        .bp-unit  { font-size: clamp(10px, 2.5vw, 13px); color: var(--secondary-text-color); margin-left: 2px; }
        .bp-last-measured { text-align: center; font-size: 0.82em; color: var(--secondary-text-color, #888); margin: 4px 0 12px; }
        .bp-alert { border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px; }
        .bp-alert.ok      { background:#E1F5EE; color:#0F6E56; border:0.5px solid #1D9E75; }
        .bp-alert.warn    { background:#FAEEDA; color:#854F0B; border:0.5px solid #BA7517; }
        .bp-alert.danger  { background:#FCEBEB; color:#A32D2D; border:0.5px solid #E24B4A; }
        .bp-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
        @media (min-width: 420px) { .bp-stats { grid-template-columns: repeat(3, 1fr); } }
        .bp-stat  { background: var(--secondary-background-color); border-radius: 10px; padding: 10px; text-align: center; min-width: 0; }
        .bp-stat-label { font-size: 10px; color: var(--secondary-text-color); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bp-stat-val   { font-size: 15px; font-weight: 500; }
        .report-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; border: 0.5px solid var(--color-border-secondary, rgba(255,255,255,0.2)); background: var(--secondary-background-color); color: var(--primary-text-color); font-size: 13px; cursor: pointer; font-family: inherit; margin-bottom: 16px; }
        .report-btn:hover { background: var(--primary-color, #1D9E75); color: #fff; }
        .report-period { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 13px; color: var(--secondary-text-color); }
        .report-period select { background: var(--secondary-background-color); color: var(--primary-text-color); border: 0.5px solid var(--color-border-secondary, rgba(255,255,255,0.2)); border-radius: 8px; padding: 5px 10px; font-size: 13px; font-family: inherit; cursor: pointer; }
        .de-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
        @media (min-width: 400px) { .de-grid { grid-template-columns: repeat(3, 1fr); } }
        .de-grid-1 { display: grid; grid-template-columns: 1fr; max-width: 180px; margin-bottom: 14px; }
        .de-field { background: var(--secondary-background-color); border-radius: 12px; padding: 14px 10px 10px; text-align: center; min-width: 0; }
        .de-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 10px; }
        .de-label small { display: block; font-size: 10px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .de-input { background: transparent; border: none; border-bottom: 1.5px solid rgba(255,255,255,0.2); color: var(--primary-text-color); font-size: clamp(20px, 7vw, 30px); font-weight: 500; width: 100%; text-align: center; padding: 4px 0; font-family: inherit; -moz-appearance: textfield; }
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
            <button class="nav-btn" data-page="measurements">&#128208; Pomiary</button>
            <button class="nav-btn" data-page="pressure">&#128138; Ci&#347;nienie</button>
            <button class="nav-btn" data-page="activity">&#127939; Aktywno&#347;&#263;</button>
            <button class="nav-btn" data-page="centile">&#128200; Siatki</button>
            <button class="nav-btn" data-page="settings">&#9998; Wprowad&#378; dane</button>
          </div>
          <div id="content"><div class="loading">Ładowanie danych...</div></div>
          <div id="page-measurements" class="nav-page" style="display:none"></div>
          <div id="page-pressure"    class="nav-page" style="display:none"></div>
          <div id="page-activity"    class="nav-page" style="display:none"></div>
          <div id="page-centile"     class="nav-page" style="display:none"></div>
          <div id="page-settings"    class="nav-page" style="display:none"></div>
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

    // Miesięczne średnie wagi i BMI do wykresów w zakładkach Waga/BMI
    var byMonthVals = new Map();
    daily.forEach(function(d) {
      var m = d[0].slice(0, 7);
      if (!byMonthVals.has(m)) byMonthVals.set(m, []);
      byMonthVals.get(m).push(d[1]);
    });
    var monthlyAvg = [];
    byMonthVals.forEach(function(vals, m) {
      var avg = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
      monthlyAvg.push([m, Math.round(avg * 100) / 100]);
    });
    monthlyAvg.sort(function(a, b) { return a[0].localeCompare(b[0]); });
    this._monthlyAvg = monthlyAvg;
    this._monthlyBmi = monthlyAvg.map(function(d) { return [d[0], self._bmi(d[1])]; });

    var currentW    = weights[weights.length - 1];
    // Data ostatniego pomiaru — ostatni dzień gdzie waga się zmieniła względem poprzedniego dnia
    var currentDate = labels[labels.length - 1];
    for (var wi = weights.length - 1; wi > 0; wi--) {
      if (Math.abs(weights[wi] - weights[wi - 1]) > 0.01) { currentDate = labels[wi]; break; }
    }
    var totalLoss   = Math.round((this.config.start_weight - currentW) * 100) / 100;
    var days        = Math.round((new Date(currentDate) - new Date(this.config.start_date)) / 86400000);
    var weeklyAvg   = Math.round(totalLoss / (days / 7) * 100) / 100;

    var h        = this._heightCm();
    var bmiNow   = this._bmi(currentW);
    var bmiStart = this._bmi(this.config.start_weight);
    var bmiCat   = this._bmiCat(bmiNow);
    var bmiPct   = Math.min(100, Math.max(0, (bmiNow - 15) / 30 * 100));
    var normKg   = Math.round(25 * Math.pow(h/100, 2) * 100) / 100;

    // Bilans aktualnego miesiąca
    var nowMonth  = currentDate.slice(0, 7);
    var monthDays = daily.filter(function(d) { return d[0].slice(0, 7) === nowMonth; });
    var monthBal  = null, monthAvgW = null, monthAvgBmi = null;
    if (monthDays.length > 0) {
      monthBal    = Math.round((monthDays[monthDays.length - 1][1] - monthDays[0][1]) * 100) / 100;
      var mSum    = monthDays.reduce(function(s, d) { return s + d[1]; }, 0);
      monthAvgW   = Math.round(mSum / monthDays.length * 100) / 100;
      var bmiSum  = monthDays.reduce(function(s, d) { return s + self._bmi(d[1]); }, 0);
      monthAvgBmi = Math.round(bmiSum / monthDays.length * 10) / 10;
    }

    // Bilans aktualnego tygodnia (od poniedziałku)
    var todayD       = new Date(currentDate);
    var dayOfWeek    = todayD.getDay() || 7;
    var weekStartD   = new Date(todayD);
    weekStartD.setDate(todayD.getDate() - dayOfWeek + 1);
    var weekStartStr = weekStartD.toLocaleDateString('sv-SE');
    var weekDays     = daily.filter(function(d) { return d[0] >= weekStartStr; });
    var weekBal      = null;
    if (weekDays.length > 0) {
      weekBal = Math.round((weekDays[weekDays.length - 1][1] - weekDays[0][1]) * 100) / 100;
    }

    var fmtBal = function(v) {
      if (v === null) return '\u2014';
      return (v <= 0 ? '\u2212' : '+') + Math.abs(v).toFixed(2) + ' kg';
    };
    var balColor = function(v) { return v === null ? '' : (v <= 0 ? 'color:#1D9E75' : 'color:#E24B4A'); };

    var bmiNormsHtml =
      '<div style="display:flex;justify-content:space-between;margin-top:5px;font-size:8px;line-height:1.3">' +
        '<span style="color:#3B8BD4;flex:1">&lt;18.5<br>Nied.</span>' +
        '<span style="color:#1D9E75;flex:1;text-align:center">18&ndash;25<br>Norma</span>' +
        '<span style="color:#BA7517;flex:1;text-align:center">25&ndash;30<br>Nadw.</span>' +
        '<span style="color:#E24B4A;flex:1;text-align:center">30&ndash;35<br>Oty. I&deg;</span>' +
        '<span style="color:#A32D2D;flex:1;text-align:center">35&ndash;40<br>Oty. II&deg;</span>' +
        '<span style="color:#701515;flex:1;text-align:right">&gt;40<br>Oty. III&deg;</span>' +
      '</div>';

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
      var achieved  = currentW <= g.weight;
      var remaining = Math.max(0, Math.round((currentW - g.weight) * 100) / 100);
      var dLeft     = self._daysUntil(g.date);
      var needed    = dLeft > 0 ? (remaining / (dLeft / 7)).toFixed(2) : '—';
      return '<div class="prog-wrap">'
        + '<div class="prog-label"><span>' + (achieved ? '&#9989; ' : '') + g.label + ' &mdash; ' + g.weight + ' kg</span><span>' + pct + '%</span></div>'
        + '<div class="prog-bg"><div class="prog-fill" style="width:' + pct + '%;background:' + (g.color||'#1D9E75') + '"></div></div>'
        + (achieved
            ? '<div class="prog-sub" style="color:#1D9E75">Cel osi&#261;gni&#281;ty!</div>'
            : '<div class="prog-sub">Brakuje ' + remaining + ' kg &middot; ' + dLeft + ' dni &middot; ' + needed + ' kg/tydz.</div>')
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
      '<div class="metric-grid" style="margin-bottom:12px">' +
        '<div class="metric"><div class="metric-label">Bilans miesiąca</div><div class="metric-value" style="' + balColor(monthBal) + '">' + fmtBal(monthBal) + '</div><div class="metric-sub">' + (nowMonth || '') + '</div></div>' +
        '<div class="metric"><div class="metric-label">Bilans tygodnia</div><div class="metric-value" style="' + balColor(weekBal) + '">' + fmtBal(weekBal) + '</div><div class="metric-sub">od ' + weekStartStr + '</div></div>' +
        '<div class="metric"><div class="metric-label">Śred. waga (mies.)</div><div class="metric-value">' + (monthAvgW !== null ? monthAvgW.toFixed(2) + ' kg' : '\u2014') + '</div><div class="metric-sub">' + (monthDays.length) + ' pomiarów</div></div>' +
        '<div class="metric"><div class="metric-label">Śred. BMI (mies.)</div><div class="metric-value" style="' + (monthAvgBmi !== null ? 'color:' + self._bmiCat(monthAvgBmi).color : '') + '">' + (monthAvgBmi !== null ? monthAvgBmi : '\u2014') + '</div><div class="metric-sub">' + (monthAvgBmi !== null ? self._bmiCat(monthAvgBmi).label : '') + '</div></div>' +
      '</div>' +
      '<div class="bmi-row">' +
        '<div class="bmi-card"><div class="bmi-label">BMI na starcie</div><div class="bmi-value" style="color:' + this._bmiCat(bmiStart).color + '">' + bmiStart + '</div><div class="bmi-cat" style="color:' + this._bmiCat(bmiStart).color + '">' + this._bmiCat(bmiStart).label + '</div><div class="bmi-bar"></div><div class="bmi-marker-wrap"><div class="bmi-marker" style="left:' + Math.min(100, Math.max(0, (bmiStart - 15) / 30 * 100)) + '%"></div></div>' + bmiNormsHtml + '<div style="font-size:11px;color:var(--secondary-text-color);margin-top:8px">Zmiana BMI: <b>' + (Math.round((bmiNow-bmiStart)*10)/10) + '</b></div><div style="font-size:11px;color:var(--secondary-text-color);margin-top:2px">Norma (BMI 25) = ' + normKg.toFixed(2) + ' kg</div></div>' +
        '<div class="bmi-card"><div class="bmi-label">BMI teraz (wzrost ' + h + ' cm)</div><div class="bmi-value" style="color:' + bmiCat.color + '">' + bmiNow + '</div><div class="bmi-cat" style="color:' + bmiCat.color + '">' + bmiCat.label + '</div><div class="bmi-bar"></div><div class="bmi-marker-wrap"><div class="bmi-marker" style="left:' + bmiPct + '%"></div></div>' + bmiNormsHtml + '</div>' +
      '</div>' +
      (this.config.goals_enabled && goalsHtml ? '<h3>&#127937; Post&#281;p do cel&#243;w</h3><div class="prog-grid">' + goalsHtml + '</div>' : '') +
      '<h3>&#128197; Bilanse</h3>' +
      '<div class="tabs">' +
        '<div class="tab active" id="tab-monthly"      onclick="this.getRootNode().host._switchTab(\'monthly\')">Miesięczne</div>' +
        '<div class="tab"        id="tab-weekly"       onclick="this.getRootNode().host._switchTab(\'weekly\')">Tygodniowe</div>' +
        '<div class="tab"        id="tab-weight-chart" onclick="this.getRootNode().host._switchTab(\'weight-chart\')">Waga</div>' +
        '<div class="tab"        id="tab-bmi-chart"    onclick="this.getRootNode().host._switchTab(\'bmi-chart\')">BMI</div>' +
      '</div>' +
      '<div id="bal-monthly" class="balance-grid">' + balRows(monthly, 'month', function(m){ return self._monthName(m); }) + '<div class="note">* miesiąc niepełny &middot; pierwsza waga miesiąca &rarr; pierwsza waga kolejnego</div></div>' +
      '<div id="bal-weekly" class="balance-grid" style="display:none">' + balRows(weekly, 'week', function(w){ return w.slice(5); }) + '<div class="note">* tydzień niepełny &middot; ostatnie 16 tygodni</div></div>' +
      '<div id="bal-weight-chart" style="display:none"><div class="chart-wrap" style="height:220px"><canvas id="wBalChart"></canvas></div></div>' +
      '<div id="bal-bmi-chart"    style="display:none"><div class="chart-wrap" style="height:220px"><canvas id="bmiBalChart"></canvas></div></div>' +
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
    if (page === 'centile') {
      this._renderCentile();
    }
    if (page === 'settings') {
      this._renderSettings();
    }
    if (page === 'measurements' && !this._measurementsLoaded) {
      this._measurementsLoaded = true;
      this._loadMeasurementsData();
    }
    var r = this.shadowRoot;
    // Pokaż/ukryj odpowiednie strony
    var content = r.getElementById('content');
    if (content) content.style.display = page === 'weight' ? '' : 'none';
    ['measurements', 'pressure', 'activity', 'centile', 'settings'].forEach(function(p) {
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
    var bp   = nav.querySelector('[data-page="pressure"]');
    var cen  = nav.querySelector('[data-page="centile"]');
    var meas = nav.querySelector('[data-page="measurements"]');
    if (bp)   bp.style.display   = this.config.bp_enabled           ? '' : 'none';
    if (cen)  cen.style.display  = this.config.centile_enabled      ? '' : 'none';
    if (meas) meas.style.display = this._hasMeasurements()          ? '' : 'none';
  }

  _hasMeasurements() {
    if (!this.config.measurements_enabled) return false;
    var cfg = this.config.measurements || {};
    return BODY_MEAS.some(function(m) { return cfg[m.key] && (cfg[m.key].entity || cfg[m.key].input); });
  }

  _renderCentile() {
    var self = this;
    var page = this.shadowRoot.getElementById('page-centile');
    if (!page) return;

    if (!this.config.centile_birthdate) {
      page.innerHTML = '<div class="empty-page"><div class="icon">&#128200;</div><div class="title">Siatki centylowe</div>'
        + '<div>Ustaw <code>centile_birthdate</code> i <code>centile_gender</code> w YAML</div></div>';
      return;
    }

    if (!this._daily || !this._daily.length) {
      page.innerHTML = '<div class="loading">&#321;adowanie danych...</div>';
      this._centilePending = true;
      return;
    }

    var gender    = this.config.centile_gender === 'male' ? 'male' : 'female';
    var birthDate = new Date(this.config.centile_birthdate);
    var h         = this._heightCm();

    // Oblicz BMI dla każdego pomiaru wagi, przypisując wiek dziecka w tej dacie
    var bmiData = this._daily.map(function(d) {
      var dt       = new Date(d[0]);
      var ageYears = (dt - birthDate) / (365.25 * 24 * 3600 * 1000);
      var bmi      = h > 0 ? Math.round(d[1] / Math.pow(h / 100, 2) * 10) / 10 : null;
      return { date: d[0], age: ageYears, weight: d[1], bmi: bmi };
    }).filter(function(d) { return d.bmi !== null && d.age >= 2 && d.age <= 20; });

    if (!bmiData.length) {
      page.innerHTML = '<div class="empty-page"><div class="icon">&#128200;</div><div class="title">Brak danych</div>'
        + '<div>Sprawd&#378; dat&#281; urodzenia i encj&#281; wagi</div></div>';
      return;
    }

    var current = bmiData[bmiData.length - 1];
    var cb      = self._getCentileBounds(current.age, gender);

    var ageYF    = Math.floor(current.age);
    var ageMF    = Math.floor((current.age - ageYF) * 12);
    var ageStr   = ageYF + ' lat' + (ageYF === 1 ? '' : '') + (ageMF > 0 ? ' ' + ageMF + ' mies.' : '');
    var genderLbl = gender === 'male' ? 'Ch&#322;opiec' : 'Dziewczynka';

    var bmiCat = current.bmi < cb.bP5  ? { label: 'Niedowaga',  color: '#9B59B6' }
               : current.bmi < cb.bP85 ? { label: 'Norma',      color: '#1D9E75' }
               : current.bmi < cb.bP95 ? { label: 'Nadwaga',    color: '#BA7517' }
               :                         { label: 'Oty&#322;o&#347;&#263;', color: '#E24B4A' };

    var hCat = h < cb.hP10 ? { label: 'Niski',              color: '#E24B4A' }
             : h < cb.hP90 ? { label: '\u015arednio-Wysoki', color: '#1D9E75' }
             :                { label: 'Bardzo wysoki',      color: '#3B8BD4' };

    page.innerHTML =
      '<div class="metric-grid" style="margin-bottom:16px">'
      + '<div class="metric"><div class="metric-label">Wiek</div><div class="metric-value">' + ageStr + '</div><div class="metric-sub">' + genderLbl + '</div></div>'
      + '<div class="metric"><div class="metric-label">BMI</div><div class="metric-value" style="color:' + bmiCat.color + '">' + current.bmi + '</div><div class="metric-sub" style="color:' + bmiCat.color + '">' + bmiCat.label + '</div></div>'
      + '<div class="metric"><div class="metric-label">Wzrost</div><div class="metric-value">' + h + ' cm</div><div class="metric-sub" style="color:' + hCat.color + '">' + hCat.label + '</div></div>'
      + '<div class="metric"><div class="metric-label">Waga</div><div class="metric-value">' + current.weight.toFixed(1) + ' kg</div><div class="metric-sub">' + current.date + '</div></div>'
      + '</div>'
      + '<h3>&#128202; BMI na tle siatki centylowej</h3>'
      + '<div class="legend">'
      + '<span><span class="ldot" style="background:rgba(155,89,182,0.6)"></span>Niedowaga (&lt;P5)</span>'
      + '<span><span class="ldot" style="background:rgba(29,158,117,0.6)"></span>Norma (P5\u2013P85)</span>'
      + '<span><span class="ldot" style="background:rgba(186,117,23,0.6)"></span>Nadwaga (P85\u2013P95)</span>'
      + '<span><span class="ldot" style="background:rgba(226,75,74,0.6)"></span>Oty\u0142o\u015b\u0107 (&gt;P95)</span>'
      + '</div>'
      + '<div class="chart-wrap" style="height:280px"><canvas id="centileBmiChart"></canvas></div>'
      + '<h3>&#128207; Wzrost \u2014 pozycja centylowa</h3>'
      + '<div class="legend">'
      + '<span><span class="ldot" style="background:rgba(226,75,74,0.6)"></span>Niski (&lt;P10)</span>'
      + '<span><span class="ldot" style="background:rgba(29,158,117,0.6)"></span>\u015arednio-Wysoki (P10\u2013P90)</span>'
      + '<span><span class="ldot" style="background:rgba(59,139,212,0.6)"></span>Bardzo wysoki (&gt;P90)</span>'
      + '</div>'
      + '<div class="chart-wrap" style="height:220px"><canvas id="centileHgtChart"></canvas></div>';

    var draw = function() {
      self._drawCentileBmiChart(bmiData, gender);
      self._drawCentileHgtChart(current.age, h, gender);
    };
    if (window.Chart) draw(); else setTimeout(draw, 500);
  }

  _getCentileBounds(ageDecimal, gender) {
    // WHO 2007 Growth Reference — format: [hP10, hP50, hP90, bmiP5, bmiP85, bmiP95]
    var T = {
      male: {
         2: [ 82.5,  87.1,  91.8, 13.8, 17.1, 18.3],
         3: [ 89.0,  94.2,  99.4, 13.5, 16.7, 17.9],
         4: [ 95.0, 100.3, 105.7, 13.2, 16.3, 17.6],
         5: [105.8, 110.0, 115.4, 13.0, 15.7, 16.9],
         6: [111.5, 116.0, 121.5, 12.9, 16.0, 17.5],
         7: [117.0, 121.7, 127.3, 13.0, 16.5, 18.4],
         8: [122.2, 127.3, 133.1, 13.2, 17.3, 19.6],
         9: [126.9, 132.6, 138.5, 13.5, 18.2, 20.9],
        10: [131.3, 137.8, 143.6, 13.9, 19.2, 22.2],
        11: [135.8, 143.5, 149.2, 14.4, 20.1, 23.2],
        12: [141.0, 149.7, 155.7, 14.8, 21.1, 24.3],
        13: [148.0, 156.5, 163.0, 15.3, 21.8, 25.1],
        14: [154.7, 163.2, 170.5, 15.8, 22.5, 25.9],
        15: [160.7, 169.0, 177.0, 16.3, 23.2, 26.6],
        16: [164.7, 173.3, 181.7, 16.8, 23.8, 27.2],
        17: [166.9, 175.9, 184.4, 17.2, 24.3, 27.7],
        18: [167.9, 177.2, 185.8, 17.6, 24.8, 28.1]
      },
      female: {
         2: [ 81.5,  86.4,  91.3, 13.6, 17.0, 18.1],
         3: [ 88.3,  93.9,  99.4, 13.2, 16.5, 17.7],
         4: [ 94.4, 100.3, 106.1, 13.0, 16.1, 17.4],
         5: [104.9, 109.4, 114.0, 12.7, 15.3, 16.6],
         6: [110.8, 115.1, 120.2, 12.6, 15.6, 17.1],
         7: [116.3, 120.6, 126.1, 12.7, 16.2, 18.0],
         8: [121.6, 126.0, 132.1, 13.0, 17.0, 19.4],
         9: [126.6, 131.2, 137.9, 13.3, 18.1, 20.9],
        10: [131.7, 136.5, 143.7, 13.7, 19.2, 22.4],
        11: [137.4, 142.5, 150.2, 14.2, 20.3, 23.8],
        12: [143.5, 149.0, 157.4, 14.7, 21.3, 25.0],
        13: [149.0, 154.6, 163.5, 15.1, 22.1, 25.9],
        14: [153.0, 158.7, 167.9, 15.5, 22.7, 26.6],
        15: [154.8, 161.2, 170.0, 15.9, 23.2, 27.1],
        16: [155.8, 162.5, 171.4, 16.2, 23.6, 27.5],
        17: [156.2, 163.1, 172.1, 16.5, 23.9, 27.7],
        18: [156.5, 163.4, 172.4, 16.7, 24.1, 27.9]
      }
    };
    var table = T[gender] || T.female;
    var age   = Math.max(2, Math.min(18, ageDecimal));
    var lo    = Math.max(2, Math.floor(age));
    var hi    = Math.min(18, lo + 1);
    var frac  = age - lo;
    var dLo   = table[lo] || table[2];
    var dHi   = table[hi] || table[18];
    var ip    = function(i) { return Math.round((dLo[i] + (dHi[i] - dLo[i]) * frac) * 10) / 10; };
    return { hP10: ip(0), hP50: ip(1), hP90: ip(2), bP5: ip(3), bP85: ip(4), bP95: ip(5) };
  }

  _drawCentileBmiChart(bmiData, gender) {
    var self    = this;
    var canvas  = this.shadowRoot.getElementById('centileBmiChart');
    if (!canvas) return;
    if (canvas._ci) { canvas._ci.destroy(); }

    var labels  = bmiData.map(function(d) { return d.date; });
    var bmiVals = bmiData.map(function(d) { return d.bmi; });
    var p5s     = bmiData.map(function(d) { return self._getCentileBounds(d.age, gender).bP5; });
    var p85s    = bmiData.map(function(d) { return self._getCentileBounds(d.age, gender).bP85; });
    var p95s    = bmiData.map(function(d) { return self._getCentileBounds(d.age, gender).bP95; });
    var all     = bmiVals.concat(p5s, p95s);
    var minY    = Math.floor(Math.min.apply(null, all) - 1);
    var maxY    = Math.ceil(Math.max.apply(null, all) + 2);
    var topLine = labels.map(function() { return maxY; });

    canvas._ci = new window.Chart(canvas, {
      data: {
        labels: labels,
        datasets: [
          { type: 'line', data: p5s,    backgroundColor: 'rgba(155,89,182,0.22)',  borderWidth: 0, pointRadius: 0, fill: 'origin', order: 10 },
          { type: 'line', data: p85s,   backgroundColor: 'rgba(29,158,117,0.22)', borderWidth: 0, pointRadius: 0, fill: '-1',     order: 11 },
          { type: 'line', data: p95s,   backgroundColor: 'rgba(186,117,23,0.28)', borderWidth: 0, pointRadius: 0, fill: '-1',     order: 12 },
          { type: 'line', data: topLine,backgroundColor: 'rgba(226,75,74,0.28)',  borderWidth: 0, pointRadius: 0, fill: '-1',     order: 13 },
          { type: 'line', label: 'BMI', data: bmiVals,
            borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.1)',
            borderWidth: 2, pointRadius: 2, pointHoverRadius: 5,
            tension: 0.3, fill: false, order: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx) {
            if (ctx.datasetIndex !== 4) return null;
            var b  = self._getCentileBounds(bmiData[ctx.dataIndex].age, gender);
            var v  = ctx.parsed.y;
            var cat = v < b.bP5 ? 'Niedowaga' : v < b.bP85 ? 'Norma' : v < b.bP95 ? 'Nadwaga' : 'Oty\u0142o\u015b\u0107';
            return ' BMI ' + v + ' \u2014 ' + cat;
          }}}
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8, color: '#73726c', font: { size: 11 }, maxRotation: 30 }, grid: { display: false } },
          y: { min: minY, max: maxY, ticks: { color: '#73726c', font: { size: 11 } }, grid: { color: 'rgba(128,128,128,0.1)' } }
        }
      }
    });
  }

  _drawCentileHgtChart(currentAge, currentHeight, gender) {
    var self   = this;
    var canvas = this.shadowRoot.getElementById('centileHgtChart');
    if (!canvas) return;
    if (canvas._ci) { canvas._ci.destroy(); }

    // Oś X: wiek od 2 do 18, co 0.5 roku
    var ages = [];
    for (var a = 2; a <= 18; a += 0.5) ages.push(Math.round(a * 10) / 10);

    var labels  = ages.map(function(a) { return a % 1 === 0 ? a + '' : ''; }); // tylko całe lata
    var p10s    = ages.map(function(a) { return self._getCentileBounds(a, gender).hP10; });
    var p50s    = ages.map(function(a) { return self._getCentileBounds(a, gender).hP50; });
    var p90s    = ages.map(function(a) { return self._getCentileBounds(a, gender).hP90; });
    var topLine = ages.map(function(a) { return self._getCentileBounds(a, gender).hP90 + 20; });

    // Marker: punkt na pozycji aktualnego wieku i wzrostu
    var closestIdx = 0;
    var minDiff    = Infinity;
    ages.forEach(function(a, i) { var d = Math.abs(a - currentAge); if (d < minDiff) { minDiff = d; closestIdx = i; } });
    var markerData = ages.map(function(_, i) { return i === closestIdx ? currentHeight : null; });

    var allH = p10s.concat(p90s, [currentHeight]);
    var minH = Math.floor(Math.min.apply(null, allH) - 5);
    var maxH = Math.ceil(Math.max.apply(null, topLine) + 2);

    canvas._ci = new window.Chart(canvas, {
      data: {
        labels: labels,
        datasets: [
          { type: 'line', data: p10s,   backgroundColor: 'rgba(226,75,74,0.22)',  borderWidth: 0, pointRadius: 0, fill: 'origin', order: 10 },
          { type: 'line', data: p90s,   backgroundColor: 'rgba(29,158,117,0.22)', borderWidth: 0, pointRadius: 0, fill: '-1',     order: 11 },
          { type: 'line', data: topLine,backgroundColor: 'rgba(59,139,212,0.22)', borderWidth: 0, pointRadius: 0, fill: '-1',     order: 12 },
          { type: 'line', data: p50s,   borderColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderDash: [4,3], pointRadius: 0, fill: false, order: 5 },
          { type: 'scatter', data: markerData.map(function(v, i) { return v !== null ? { x: i, y: v } : null; }).filter(Boolean),
            backgroundColor: '#FFD700', borderColor: '#FFD700', pointRadius: 8, pointStyle: 'triangle', order: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx) {
            if (ctx.datasetIndex !== 4) return null;
            var b   = self._getCentileBounds(currentAge, gender);
            var cat = currentHeight < b.hP10 ? 'Niski' : currentHeight < b.hP90 ? '\u015arednio-Wysoki' : 'Bardzo wysoki';
            return ' ' + currentHeight + ' cm \u2014 ' + cat;
          }}}
        },
        scales: {
          x: { ticks: { color: '#73726c', font: { size: 11 } }, grid: { display: false } },
          y: { min: minH, max: maxH,
               ticks: { color: '#73726c', font: { size: 11 }, callback: function(v) { return v + ' cm'; } },
               grid: { color: 'rgba(128,128,128,0.1)' } }
        }
      }
    });
  }

  _renderSettings() {
    var page = this.shadowRoot.getElementById('page-settings');
    if (!page) return;
    var self = this;
    var cfg  = this.config;

    var val = function(entityId) {
      if (!entityId) return '';
      var s = self._hass && self._hass.states[entityId];
      return (s && !isNaN(parseFloat(s.state))) ? Math.round(parseFloat(s.state)) : '';
    };

    var field = function(id, label, unit, entityId, min, max) {
      var hintStyle = 'display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;';
      var hint = entityId
        ? '<small style="' + hintStyle + 'color:var(--secondary-text-color)">' + entityId + '</small>'
        : '<small style="' + hintStyle + 'color:#E24B4A">brak encji w YAML</small>';
      var disabled = entityId ? '' : ' disabled';
      return '<div class="de-field">'
        + '<div class="de-label">' + label + '<small>' + unit + '</small></div>'
        + hint
        + '<input class="de-input" id="' + id + '" type="number" min="' + min + '" max="' + max + '" value="' + val(entityId) + '" placeholder="\u2014"' + disabled + '>'
        + '</div>';
    };

    var bpMissing = !cfg.bp_systolic_now || !cfg.bp_diastolic_now || !cfg.bp_pulse_now;
    var hMissing  = !cfg.height_cm_entity;

    var measCfg    = cfg.measurements || {};
    var measFields = BODY_MEAS.filter(function(m) { return measCfg[m.key] && measCfg[m.key].input; });
    var measHtml   = measFields.length
      ? '<h3>&#128208; Pomiary cia\u0142a</h3>'
        + '<div class="de-grid">'
        + measFields.map(function(m) { return field('de-meas-' + m.key, m.label, 'cm', measCfg[m.key].input, m.min, m.max); }).join('')
        + '</div>'
        + '<button class="report-btn" id="de-save-meas">&#128190; Zapisz pomiary</button>'
        + '<div class="de-status" id="de-status-meas"></div>'
      : '';

    page.innerHTML =
      '<h3>&#128138; Ci&#347;nienie krwi</h3>'
      + '<div class="de-grid">'
      +   field('de-sys', 'Skurczowe',   'mmHg', cfg.bp_systolic_now,  60,  250)
      +   field('de-dia', 'Rozkurczowe', 'mmHg', cfg.bp_diastolic_now, 40,  150)
      +   field('de-pul', 'Puls',        'bpm',  cfg.bp_pulse_now,     30,  200)
      + '</div>'
      + '<button class="report-btn" id="de-save-bp"' + (bpMissing ? ' disabled style="opacity:.4"' : '') + '>&#128190; Zapisz ci&#347;nienie</button>'
      + '<div class="de-status" id="de-status-bp">' + (bpMissing ? '\u26a0 Skonfiguruj bp_systolic_now, bp_diastolic_now, bp_pulse_now w YAML.' : '') + '</div>'
      + '<h3>&#128207; Wzrost</h3>'
      + '<div class="de-grid-1">'
      +   field('de-height', 'Wzrost', 'cm', cfg.height_cm_entity, 100, 250)
      + '</div>'
      + '<button class="report-btn" id="de-save-height"' + (hMissing ? ' disabled style="opacity:.4"' : '') + '>&#128190; Zapisz wzrost</button>'
      + '<div class="de-status" id="de-status-height">' + (hMissing ? '\u26a0 Skonfiguruj height_cm_entity w YAML.' : '') + '</div>'
      + measHtml;

    if (!bpMissing)     page.querySelector('#de-save-bp').addEventListener('click',     function() { self._saveBloodPressure(); });
    if (!hMissing)      page.querySelector('#de-save-height').addEventListener('click', function() { self._saveHeight(); });
    if (measFields.length) page.querySelector('#de-save-meas').addEventListener('click', function() { self._saveMeasurements(); });
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

      // Ostatni pomiar — ostatni punkt ze statystyk (nie last_changed, bo restart HA fałszuje timestamp)
      var lastTs = null;
      [sysStats, diaStats, pulStats].forEach(function(arr) {
        if (!arr.length) return;
        var t = new Date(self._ts(arr[arr.length - 1]));
        if (!lastTs || t > lastTs) lastTs = t;
      });
      var lastMeasured = lastTs
        ? lastTs.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

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
        '<div class="bp-last-measured">&#128336; Ostatni pomiar: <strong>' + lastMeasured + '</strong></div>' +
        '<h3>&#128202; Statystyki (30 dni)</h3>' +
        '<div class="bp-stats">' +
          '<div class="bp-stat"><div class="bp-stat-label">&#216; Skurczowe</div><div class="bp-stat-val">' + avg(sysRecent) + ' mmHg</div></div>' +
          '<div class="bp-stat"><div class="bp-stat-label">Min / Max</div><div class="bp-stat-val">' + mn(sysRecent) + ' / ' + mx(sysRecent) + '</div></div>' +
          '<div class="bp-stat"><div class="bp-stat-label">&#216; Rozkurczowe</div><div class="bp-stat-val">' + avg(diaRecent) + ' mmHg</div></div>' +
          '<div class="bp-stat"><div class="bp-stat-label">Min / Max</div><div class="bp-stat-val">' + mn(diaRecent) + ' / ' + mx(diaRecent) + '</div></div>' +
          '<div class="bp-stat"><div class="bp-stat-label">&#216; Puls</div><div class="bp-stat-val">' + avg(pulRecent) + ' bpm</div></div>' +
          '<div class="bp-stat"><div class="bp-stat-label">Min / Max</div><div class="bp-stat-val">' + mn(pulRecent) + ' / ' + mx(pulRecent) + '</div></div>' +
        '</div>' +
        '<div class="report-period">' + 'Okres raportu: ' + '<select id="report-period-select">' + '<option value="7">Ostatnie 7 dni</option>' + '<option value="14">Ostatnie 14 dni</option>' + '<option value="30" selected>Ostatnie 30 dni</option>' + '<option value="90">Ostatnie 90 dni</option>' + '</select>' + '</div>' + '<button class="report-btn" id="btn-gen-pdf">&#128196; Generuj raport PDF</button>' +
        '<h3>&#128200; Historia (90 dni)</h3>' +
        '<div class="legend">' +
          '<span><span class="ldot" style="background:#E24B4A"></span>Skurczowe</span>' +
          '<span><span class="ldot" style="background:#3B8BD4"></span>Rozkurczowe</span>' +
          '<span><span class="ldot" style="background:#1D9E75"></span>Puls</span>' +
          '<span><span class="ldot" style="background:#E24B4A;opacity:.35;border:1px dashed #E24B4A"></span>Norma 120</span>' +
          '<span><span class="ldot" style="background:#3B8BD4;opacity:.35;border:1px dashed #3B8BD4"></span>Norma 80</span>' +
        '</div>' +
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
          .filter(function(e) { return e.ts > 0 && e.ts >= start.getTime(); })
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

      // Krok 2: usuń duplikaty wartości — HA przy restarcie/reconnect ponownie odczytuje
      // ostatni stan z urządzenia (nawet po dniach/tygodniach). Prawdziwy pomiar prawie
      // zawsze różni się od poprzedniego; jeśli sys/dia/pul identyczne jak bezpośrednio
      // poprzedni wpis — to artefakt HA, nie nowy pomiar.
      measurements = measurements.filter(function(m, i) {
        if (i === 0) return true;
        var prev = measurements[i - 1];
        return m.sys !== prev.sys || m.dia !== prev.dia || m.pul !== prev.pul;
      });

      // Krok 3: usuń pomiary z ręcznie wykluczonych timestampów (bp_exclude_timestamps w YAML)
      // Format: "YYYY-MM-DD HH:MM" — dopasowanie z dokładnością do minuty
      var excludeSet = new Set((self.config.bp_exclude_timestamps || []).map(function(s) {
        return s.trim().substring(0, 16); // "YYYY-MM-DD HH:MM"
      }));
      if (excludeSet.size > 0) {
        measurements = measurements.filter(function(m) {
          var d = new Date(m.ts);
          var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
          var label = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
                    + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
          return !excludeSet.has(label);
        });
      }

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
      var bmiVal      = weightState ? self._bmi(parseFloat(weightState.state)) : null;
      var bmiStr      = bmiVal !== null ? bmiVal + ' (' + self._bmiCat(bmiVal).label + ')' : '\u2014';

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
        + '<tr><td>BMI:</td><td>' + bmiStr + '</td></tr>'
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

      var tickColor = getComputedStyle(self.shadowRoot.host).getPropertyValue('--secondary-text-color').trim() || '#888';

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
                ticks: { maxTicksLimit: 12, color: tickColor, font: { size: 10 }, maxRotation: 0 },
                grid: { display: false },
              },
              y: {
                ticks: {
                  color: tickColor,
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
    var r    = this.shadowRoot;
    var tabs = ['monthly', 'weekly', 'weight-chart', 'bmi-chart'];
    tabs.forEach(function(t) {
      var tabEl = r.getElementById('tab-' + t);
      var panEl = r.getElementById('bal-' + t);
      if (tabEl) tabEl.classList.toggle('active', t === tab);
      if (panEl) panEl.style.display = (t === tab) ? '' : 'none';
    });
    if (tab === 'weight-chart') this._drawWeightBalChart();
    if (tab === 'bmi-chart')    this._drawBmiChart();
  }

  _drawWeightBalChart() {
    var self = this;
    var data = this._monthlyAvg || [];
    if (!data.length) return;
    var draw = function() {
      var canvas = self.shadowRoot.getElementById('wBalChart');
      if (!canvas) return;
      if (canvas._chartInst) { canvas._chartInst.destroy(); }
      var labels = data.map(function(d) { return self._monthName(d[0]); });
      var vals   = data.map(function(d) { return d[1]; });
      var mn = Math.floor(Math.min.apply(null, vals) - 1);
      var mx = Math.ceil(Math.max.apply(null, vals) + 1);
      canvas._chartInst = new window.Chart(canvas, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Śred. waga',
            data: vals,
            borderColor: '#378ADD',
            backgroundColor: 'rgba(55,138,221,0.12)',
            borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
            tension: 0.3, fill: true
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.parsed.y.toFixed(2) + ' kg'; } } }
          },
          scales: {
            x: { ticks: { color: '#73726c', font: { size: 11 }, maxRotation: 30 }, grid: { display: false } },
            y: { min: mn, max: mx, ticks: { callback: function(v) { return v + ' kg'; }, color: '#73726c', font: { size: 11 } }, grid: { color: 'rgba(128,128,128,0.1)' } }
          }
        }
      });
    };
    if (window.Chart) draw(); else setTimeout(draw, 500);
  }

  _drawBmiChart() {
    var self = this;
    var data = this._monthlyBmi || [];
    if (!data.length) return;
    var draw = function() {
      var canvas = self.shadowRoot.getElementById('bmiBalChart');
      if (!canvas) return;
      if (canvas._chartInst) { canvas._chartInst.destroy(); }
      var labels = data.map(function(d) { return self._monthName(d[0]); });
      var vals   = data.map(function(d) { return d[1]; });
      var pointColors = vals.map(function(v) { return self._bmiCat(v).color; });
      var mn = Math.floor(Math.min.apply(null, vals) - 0.5);
      var mx = Math.ceil(Math.max.apply(null, vals) + 0.5);
      var refLine = function(val, color, label) {
        return { type: 'line', label: label, data: labels.map(function(){ return val; }),
          borderColor: color, borderWidth: 1, borderDash: [4, 3],
          pointRadius: 0, fill: false, order: 10 };
      };
      canvas._chartInst = new window.Chart(canvas, {
        data: {
          labels: labels,
          datasets: [
            { type: 'line', label: 'BMI', data: vals,
              borderColor: '#BA7517', backgroundColor: 'rgba(186,117,23,0.1)',
              borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
              pointBackgroundColor: pointColors,
              tension: 0.3, fill: true, order: 1 },
            refLine(18.5, '#3B8BD4', 'Niedowaga'),
            refLine(25.0, '#1D9E75', 'Norma'),
            refLine(30.0, '#BA7517', 'Nadwaga'),
            refLine(35.0, '#E24B4A', 'Otyłość I°')
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: {
              label: function(ctx) {
                if (ctx.datasetIndex !== 0) return null;
                return ' BMI ' + ctx.parsed.y + ' — ' + self._bmiCat(ctx.parsed.y).label;
              }
            }}
          },
          scales: {
            x: { ticks: { color: '#73726c', font: { size: 11 }, maxRotation: 30 }, grid: { display: false } },
            y: { min: mn, max: mx, ticks: { color: '#73726c', font: { size: 11 } }, grid: { color: 'rgba(128,128,128,0.1)' } }
          }
        }
      });
    };
    if (window.Chart) draw(); else setTimeout(draw, 500);
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
            min: Math.floor(Math.min.apply(null, weights) - 2),
            max: Math.ceil(Math.max.apply(null, weights.concat([this.config.start_weight || 0])) + 2),
            ticks: { callback: function(v){ return v + ' kg'; }, color: '#73726c', font: { size: 11 }, stepSize: 5 },
            grid: { color: 'rgba(128,128,128,0.1)' }
          }
        }
      }
    });
  }

  async _loadMeasurementsData() {
    var self = this;
    var page = this.shadowRoot.getElementById('page-measurements');
    if (!page) return;

    var cfg  = this.config.measurements || {};
    var keys = BODY_MEAS.map(function(m) { return m.key; })
                        .filter(function(k) { return cfg[k] && (cfg[k].entity || cfg[k].input); });

    if (!keys.length) {
      page.innerHTML = '<div class="empty-page"><div class="icon">&#128208;</div>'
        + '<div class="title">Brak konfiguracji</div>'
        + '<div>Skonfiguruj <code>measurements</code> w YAML karty</div></div>';
      return;
    }

    page.innerHTML = '<div class="loading">&#321;adowanie pomiarów...</div>';

    try {
      var now   = new Date();
      var start = new Date(now);
      start.setFullYear(start.getFullYear() - 2);

      var entityIds = keys
        .map(function(k) { return cfg[k].entity; })
        .filter(Boolean);

      var stats = {};
      if (entityIds.length) {
        stats = await self._hass.connection.sendMessagePromise({
          type:          'recorder/statistics_during_period',
          start_time:    start.toISOString(),
          end_time:      now.toISOString(),
          statistic_ids: entityIds,
          period:        'day',
          units:         {},
          types:         ['mean', 'state'],
        });
      }

      self._renderMeasurementsContent(keys, stats);

    } catch(err) {
      page.innerHTML = '<div style="color:#E24B4A;padding:20px">Błąd: ' + err.message + '</div>';
    }
  }

  _renderMeasurementsContent(keys, stats) {
    var self = this;
    var cfg  = this.config.measurements || {};
    var page = this.shadowRoot.getElementById('page-measurements');
    if (!page) return;

    // Aktualne wartości ze stanów HA
    var currentVals = {};
    keys.forEach(function(k) {
      var entityId = cfg[k].entity || cfg[k].input;
      if (!entityId) return;
      var st = self._hass.states[entityId];
      if (st && !isNaN(parseFloat(st.state))) {
        currentVals[k] = Math.round(parseFloat(st.state) * 10) / 10;
      }
    });

    // Ostatni pomiar z historii
    var lastDates = {};
    keys.forEach(function(k) {
      var entityId = cfg[k].entity;
      if (!entityId) return;
      var arr = stats[entityId] || [];
      if (arr.length) {
        var s   = arr[arr.length - 1];
        var val = s.mean != null ? s.mean : s.state;
        if (!isNaN(val)) lastDates[k] = self._day(self._ts(s));
      }
    });

    // Kafelki z aktualnymi wartościami
    var meas = BODY_MEAS.filter(function(m) { return keys.indexOf(m.key) >= 0; });
    var metricsHtml = meas.map(function(m) {
      var val  = currentVals[m.key];
      var date = lastDates[m.key] || '';
      return '<div class="metric">'
        + '<div class="metric-label">' + m.label + '</div>'
        + '<div class="metric-value">' + (val != null ? val.toFixed(1) + ' cm' : '—') + '</div>'
        + '<div class="metric-sub">' + date + '</div>'
        + '</div>';
    }).join('');

    // Dane historii — oś X
    var dateSet = new Set();
    keys.forEach(function(k) {
      var entityId = cfg[k].entity;
      if (!entityId) return;
      (stats[entityId] || []).forEach(function(s) {
        dateSet.add(self._day(self._ts(s)));
      });
    });
    var allDates = Array.from(dateSet).sort();

    var datasets = meas.map(function(m) {
      var entityId = cfg[m.key].entity;
      var dayMap   = new Map();
      if (entityId) {
        (stats[entityId] || []).forEach(function(s) {
          var val = s.mean != null ? s.mean : s.state;
          if (!isNaN(val)) dayMap.set(self._day(self._ts(s)), Math.round(val * 10) / 10);
        });
      }
      var data = allDates.map(function(d) { return dayMap.has(d) ? dayMap.get(d) : null; });
      var col  = MEAS_COLORS[m.key] || '#888';
      return {
        type: 'line', label: m.label, data: data,
        borderColor: col, backgroundColor: col + '22',
        borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
        tension: 0.3, fill: false, spanGaps: true,
      };
    });

    var legendHtml = meas.map(function(m) {
      return '<span><span class="ldot" style="background:' + (MEAS_COLORS[m.key] || '#888') + '"></span>' + m.label + '</span>';
    }).join('');

    page.innerHTML =
      '<div class="metric-grid">' + metricsHtml + '</div>'
      + '<h3>&#128202; Aktualny profil pomiarów</h3>'
      + '<div class="chart-wrap" style="height:280px"><canvas id="measRadarChart"></canvas></div>'
      + '<h3>&#128200; Historia pomiarów</h3>'
      + '<div class="legend">' + legendHtml + '</div>'
      + '<div class="chart-wrap" style="height:240px"><canvas id="measHistChart"></canvas></div>';

    var draw = function() {
      self._drawMeasurementsRadar(meas, currentVals);
      self._drawMeasurementsHistory(allDates, datasets);
    };
    if (window.Chart) draw(); else setTimeout(draw, 500);
  }

  _drawMeasurementsRadar(meas, currentVals) {
    var canvas = this.shadowRoot.getElementById('measRadarChart');
    if (!canvas) return;
    if (canvas._ci) { canvas._ci.destroy(); }

    var labels = meas.map(function(m) { return m.label; });
    var data   = meas.map(function(m) {
      var val = currentVals[m.key];
      if (val == null) return null;
      return Math.round(Math.max(0, Math.min(100, (val - m.min) / (m.max - m.min) * 100)) * 10) / 10;
    });

    canvas._ci = new window.Chart(canvas, {
      type: 'radar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Pomiary',
          data: data,
          borderColor: '#3B8BD4',
          backgroundColor: 'rgba(59,139,212,0.2)',
          pointBackgroundColor: meas.map(function(m) { return MEAS_COLORS[m.key] || '#3B8BD4'; }),
          pointRadius: 5,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                var m   = meas[ctx.dataIndex];
                var raw = m ? currentVals[m.key] : null;
                return m ? (' ' + m.label + ': ' + (raw != null ? raw.toFixed(1) + ' cm' : '—')) : null;
              }
            }
          }
        },
        scales: {
          r: {
            min: 0, max: 100,
            ticks: {
              stepSize: 25, color: '#73726c', font: { size: 10 },
              callback: function(v) { return v + '%'; }
            },
            grid: { color: 'rgba(128,128,128,0.2)' },
            pointLabels: { color: 'var(--primary-text-color)', font: { size: 11 } }
          }
        }
      }
    });
    this._measChart = canvas._ci;
  }

  _drawMeasurementsHistory(allDates, datasets) {
    var canvas = this.shadowRoot.getElementById('measHistChart');
    if (!canvas) return;
    if (canvas._ci) { canvas._ci.destroy(); }
    if (!allDates.length) return;

    var labels = allDates.map(function(d) {
      var dt = new Date(d);
      return dt.getDate() + '.' + (dt.getMonth() + 1);
    });

    canvas._ci = new window.Chart(canvas, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true, position: 'bottom',
            labels: { color: 'var(--primary-text-color)', font: { size: 10 }, boxWidth: 12, padding: 8 }
          },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y + ' cm';
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 10, color: '#73726c', font: { size: 10 }, maxRotation: 30 },
            grid: { display: false }
          },
          y: {
            ticks: { color: '#73726c', font: { size: 10 }, callback: function(v) { return v + ' cm'; } },
            grid: { color: 'rgba(128,128,128,0.1)' }
          }
        }
      }
    });
    this._measHistChart = canvas._ci;
  }

  _saveMeasurements() {
    var self    = this;
    var r       = this.shadowRoot;
    var cfg     = this.config.measurements || {};
    var st      = r.getElementById('de-status-meas');
    var calls   = [];
    var invalid = [];

    BODY_MEAS.forEach(function(m) {
      var mcfg = cfg[m.key];
      if (!mcfg || !mcfg.input) return;
      var el = r.getElementById('de-meas-' + m.key);
      if (!el || el.value === '') return;
      var val = parseFloat(el.value);
      if (isNaN(val) || val < m.min || val > m.max) {
        invalid.push(m.label);
        if (el) el.classList.add('invalid');
        return;
      }
      if (el) el.classList.remove('invalid');
      calls.push(self._hass.callService('input_number', 'set_value', {
        entity_id: mcfg.input,
        value:     val,
      }));
    });

    if (invalid.length) {
      if (st) { st.textContent = '⚠ Nieprawidłowe wartości: ' + invalid.join(', '); st.className = 'de-status err'; }
      return;
    }
    if (!calls.length) {
      if (st) { st.textContent = '⚠ Nie podano żadnych wartości.'; st.className = 'de-status err'; }
      return;
    }

    Promise.all(calls).then(function() {
      if (st) { st.textContent = '✓ Zapisano pomiary.'; st.className = 'de-status ok'; }
      self._measurementsLoaded = false;
    }).catch(function(e) {
      if (st) { st.textContent = '⚠ Błąd: ' + e.message; st.className = 'de-status err'; }
    });
  }

  getCardSize() { return 12; }
}

customElements.define('health-card', HealthCard);