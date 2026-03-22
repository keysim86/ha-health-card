# Health Card

<p align="center">
  <img src="https://raw.githubusercontent.com/keysim86/ha-health-card/main/icons/health-card.png" alt="Health Card" width="100"/>
</p>

[![Release](https://img.shields.io/github/v/release/keysim86/ha-health-card?style=flat-square)](https://github.com/keysim86/ha-health-card/releases/latest)
[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg?style=flat-square)](https://github.com/keysim86/ha-health-card)
[![HA](https://img.shields.io/badge/Home%20Assistant-2023.0%2B-blue?style=flat-square)](https://www.home-assistant.io/)

> Karta Lovelace do monitorowania zdrowia — waga, ciśnienie krwi, aktywność. Dane z Home Assistant, raporty PDF.

---

## Zakładki

| Zakładka | Opis |
|---|---|
| ⚖ Waga | Waga ciała, BMI, postęp do celów, bilanse miesięczne/tygodniowe, wykres historii |
| 💊 Ciśnienie | Skurczowe, rozkurczowe, puls, statystyki, wykres, generowanie raportu PDF |
| 🏃 Aktywność | W budowie |
| ⚙ Konfiguracja | W budowie |

---

## Funkcje — Waga

- Aktualna waga, łączna utrata, średnie tempo
- BMI z kategorią i paskiem wizualnym (skala niedowaga → otyłość III°)
- Postęp do celów wagowych z licznikiem dni i wymaganym tempem
- Bilanse miesięczne (ostatnie 12) i tygodniowe (ostatnie 16) z paskami
- Wykres historii z trendem 7-dniowym
- Przełącznik zakresu: od początku / 6 mies. / 3 mies. / 30 dni / 14 dni / 7 dni
- Dane z long-term + short-term statistics HA (ostatnie 48h)
- Alert gdy cel krwiodawstwa jest w ciągu 7 dni

## Funkcje — Ciśnienie

- Aktualne wartości skurczowego, rozkurczowego i pulsu z kolorowaniem wg normy
- Alert bazujący na encji kategorii lub automatyczna klasyfikacja WHO
- Statystyki 30 dni: średnia, min, max dla każdego parametru
- Wykres 90 dni z liniami norm (120/80 mmHg)
- **Generowanie raportu PDF** z wyborem okresu (7/14/30/90 dni) zawierającego:
  - Dane osobowe (imię, data urodzenia, wzrost/waga, urządzenie)
  - Tabelę pomiarów z datą, godziną, porą dnia i kategorią WHO
  - Podsumowanie statystyczne z oceną

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
title: Jan Waga
path: jan-waga
panel: true
cards:
  - type: custom:health-card
    # --- Waga ---
    entity_id: sensor.weight                 # encja wagi (wymagane)
    start_weight: 90.0                       # waga startowa w kg
    start_date: "2025-01-01"                 # data startu
    height_cm_entity: input_number.wzrost   # encja wzrostu (opcjonalne)
    height_cm: 175                           # wzrost w cm (fallback)
    history_days: 365                        # ile dni historii pobierać

    # --- Ciśnienie ---
    bp_systolic:  sensor.bp_skurczowe       # encja skurczowego
    bp_diastolic: sensor.bp_rozkurczowe     # encja rozkurczowego
    bp_pulse:     sensor.bp_puls            # encja pulsu
    bp_category:  sensor.kategoria_cisnienia # encja kategorii (opcjonalne)

    # --- Raport PDF ---
    report_name:      "Jan Kowalski"
    report_birthdate: "1990-01-15"           # opcjonalne, format YYYY-MM-DD
    report_device:    "Ciśnieniomierz"       # nazwa urządzenia

    # --- Cele wagowe ---
    goals:
      - key: blood_donation                  # blood_donation = specjalny alert 7 dni przed
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

## Wymagania

- Home Assistant 2023.0.0+
- Encje wagi i ciśnienia muszą mieć `state_class: measurement` aby były w long-term statistics HA

---

## Dla wielu użytkowników

Jeden plik `health-card.js` obsługuje wszystkich — każda osoba konfiguruje własną kartę przez YAML z inną encją, wagą startową i celami.
