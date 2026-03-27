# Health Card

<p align="center">
  <img src="https://raw.githubusercontent.com/keysim86/ha-health-card/main/icons/health-card.png" alt="Health Card" width="100"/>
</p>

[![Release](https://img.shields.io/github/v/release/keysim86/ha-health-card?style=flat-square)](https://github.com/keysim86/ha-health-card/releases/latest)
[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg?style=flat-square)](https://github.com/keysim86/ha-health-card)
[![HA](https://img.shields.io/badge/Home%20Assistant-2024.1%2B-blue?style=flat-square)](https://www.home-assistant.io/)
[![License](https://img.shields.io/github/license/keysim86/ha-home-dashboard-card.svg)](LICENSE)

> Karta Lovelace do monitorowania zdrowia — waga, ciśnienie krwi, aktywność, siatki centylowe. Dane z Home Assistant, raporty PDF.

---

## Zakładki

| Zakładka | Opis |
|---|---|
| ⚖ Waga | Waga ciała, BMI, bilanse bieżące, postęp do celów, wykresy historii i BMI, data ostatniego pomiaru |
| 💊 Ciśnienie | Skurczowe, rozkurczowe, puls, statystyki, wykres 90 dni, raport PDF |
| 🏃 Aktywność | Kroki i kalorie — dzienne wykresy słupkowe, cel dzienny, statystyki |
| 📈 Siatki centylowe | BMI i wzrost dziecka na tle norm WHO 2007, strefy centylowe |
| ✏ Wprowadź dane | Ręczny zapis ciśnienia i wzrostu do `input_number` |

Zakładki **Ciśnienie** i **Siatki centylowe** można włączać/wyłączać przez YAML.

---

## Funkcje — Waga

- Aktualna waga, łączna utrata, średnie tempo tygodniowe
- **Bieżący bilans**: zmiana wagi w aktualnym miesiącu i tygodniu, średnia waga i średnie BMI z bieżącego miesiąca
- BMI z kategorią i paskiem wizualnym (skala niedowaga → otyłość III°)
- Postęp do celów wagowych z licznikiem dni i wymaganym tempem
- Bilanse miesięczne (ostatnie 12) i tygodniowe (ostatnie 16) z paskami
- Wykresy w zakładkach bilansów: **Waga** (miesięczna średnia), **BMI** (miesięczne BMI z liniami norm i kolorowymi punktami)
- Wykres historii z trendem 7-dniowym, oś Y dopasowuje się dynamicznie do danych
- Przełącznik zakresu: od początku / 6 mies. / 3 mies. / 30 dni / 14 dni / 7 dni
- Alert gdy cel krwiodawstwa jest w ciągu 7 dni
- Nawigacja przyklejona do góry podczas scrollowania

## Funkcje — Ciśnienie

- Aktualne wartości z kolorowaniem wg normy — pobierane z `input_number` (priorytet) lub `sensor`
- Alert bazujący na encji kategorii lub automatyczna klasyfikacja WHO
- Statystyki 30 dni: średnia, min, max dla każdego parametru
- Wykres 90 dni z liniami norm (120/80 mmHg)
- **Generowanie raportu PDF** z wyborem okresu (7/14/30/90 dni):
  - Dane osobowe (imię, data urodzenia, wzrost/waga, urządzenie)
  - Tabela pomiarów z datą, godziną, porą dnia i kategorią WHO
  - Deduplikacja artefaktów HA: usuwa powtórzenia powstałe przez re-odczyt po restarcie
  - Ręczne wykluczanie konkretnych timestampów przez `bp_exclude_timestamps`
  - Podsumowanie statystyczne z oceną
- Zakładka ciśnienia może być wyłączona przez `bp_enabled: false` w YAML

## Funkcje — Aktywność

- Aktualna liczba kroków i kalorii z ich procentem realizacji celu
- Wykresy słupkowe dzienne kroków i kalorii (kolorowanie: zielony ≥ cel, pomarańczowy ≥ 50%, czerwony < 50%)
- Przełącznik zakresu: 7 / 14 / 30 / 90 dni
- Statystyki: średnia i max dla wybranego okresu

## Funkcje — Wprowadź dane

- Formularz zapisu ciśnienia (skurczowe / rozkurczowe / puls) do encji `input_number` — tylko gdy wszystkie trzy pola są wypełnione
- Formularz zapisu wzrostu do `input_number`
- Pod każdym polem wyświetlana jest nazwa encji z YAML lub ostrzeżenie o braku konfiguracji

---

## Instalacja przez HACS

1. HACS → Interfejs użytkownika → (3 kropki) → **Repozytoria niestandardowe**
2. URL: `https://github.com/keysim86/ha-health-card`
3. Kategoria: `Lovelace`
4. Kliknij **Dodaj**
5. Znajdź **Health Card** na liście pobranych → **Pobierz**

## Instalacja ręczna

Skopiuj `health-card.js` do `/config/www/` i dodaj zasób w HA:

**Ustawienia → Pulpity nawigacyjne → Zasoby → Dodaj zasób**
- URL: `/local/health-card.js`
- Typ: `JavaScript module`

---

## Konfiguracja

```yaml
type: custom:health-card

# --- Waga ---
entity_id: sensor.weight               # encja wagi (wymagane)
start_weight: 90.0                     # waga startowa w kg
start_date: "2025-01-01"              # data startu
height_cm_entity: input_number.wzrost  # encja wzrostu do odczytu i zapisu
height_cm: 175                         # wzrost w cm (fallback gdy brak encji)
history_days: 365                      # ile dni historii pobierać

# --- Ciśnienie (historia) ---
bp_systolic:  sensor.bp_skurczowe
bp_diastolic: sensor.bp_rozkurczowe
bp_pulse:     sensor.bp_puls
bp_category:  sensor.kategoria_cisnienia   # opcjonalne — encja kategorii słownej

# --- Ciśnienie (aktualne wartości z input_number) ---
bp_systolic_now:  input_number.bp_systolic
bp_diastolic_now: input_number.bp_diastolic
bp_pulse_now:     input_number.bp_pulse

# --- Widoczność zakładki Ciśnienie ---
bp_enabled: true                       # false = ukrywa zakładkę Ciśnienie

# --- Aktywność ---
steps_entity:    sensor.daily_steps
calories_entity: sensor.kalorie_dzienne
steps_goal:    10000
calories_goal:   800

# --- Raport PDF ---
report_name:      "Jan Kowalski"
report_birthdate: "1990-01-15"         # format YYYY-MM-DD, opcjonalne
report_device:    "Ciśnieniomierz"

# --- Deduplikacja PDF (ręczne wykluczenia) ---
bp_exclude_timestamps:
  - "2026-03-16 22:59"                 # format YYYY-MM-DD HH:MM, strefa lokalna
  - "2026-03-17 07:05"

# --- Cele wagowe ---
goals:
  - key: blood_donation                # blood_donation = alert 7 dni przed datą
    weight: 80.0
    label: Krwiodawstwo
    date: "2025-06-01"
    color: "#BA7517"
  - key: summer
    weight: 75.0
    label: Lato
    date: "2025-07-01"
    color: "#1D9E75"
```

---

## Dla wielu użytkowników

Jeden plik `health-card.js` obsługuje wszystkich — każda osoba konfiguruje własną kartę przez YAML z własnymi encjami, wagą startową i celami. Zmiana konfiguracji powoduje automatyczne przeładowanie wszystkich danych.

---

## Wymagania

- Home Assistant 2024.1.0+
- HACS 1.34.0+
- Encje wagi i ciśnienia muszą mieć `state_class: measurement` aby były dostępne w long-term statistics HA
