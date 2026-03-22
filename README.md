# Health Card

[![Release](https://img.shields.io/github/v/release/keysim86/ha-health-card?style=flat-square)](https://github.com/keysim86/ha-health-card/releases/latest)
[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg?style=flat-square)](https://github.com/keysim86/ha-health-card)
[![HA](https://img.shields.io/badge/Home%20Assistant-2023.0%2B-blue?style=flat-square)](https://www.home-assistant.io/)

> Karta Lovelace do śledzenia wagi ciała — BMI, bilanse miesięczne/tygodniowe, wykres historii i postęp do celów.

---

## Funkcje

- Aktualna waga, łączna utrata, średnie tempo
- BMI z kategorią i paskiem wizualnym (skala niedowaga → otyłość III°)
- Postęp do celów wagowych z licznikiem dni i wymaganym tempem
- Bilanse miesięczne (ostatnie 12) i tygodniowe (ostatnie 16) z paskami
- Wykres historii z trendem 7-dniowym
- Przełącznik zakresu wykresu: od początku / 6 mies. / 3 mies. / 30 dni / 14 dni / 7 dni
- Dane z long-term statistics + short-term statistics (ostatnie 48h)
- Alert gdy cel krwiodawstwa jest w ciągu 7 dni
- W pełni konfigurowalny przez YAML — jeden plik JS dla wielu użytkowników

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
    entity_id: sensor.weight                 # encja wagi (wymagane)
    start_weight: 90.0                       # waga startowa w kg
    start_date: "2025-01-01"                 # data startu
    height_cm_entity: input_number.wzrost   # encja wzrostu (opcjonalne)
    height_cm: 175                           # wzrost w cm (fallback)
    history_days: 365                        # ile dni historii pobierać
    goals:
      - key: blood_donation                  # blood_donation = specjalny alert 7 dni przed
        weight: 117.5
        label: Krwiodawstwo
        date: "2026-03-23"
        color: "#BA7517"
      - key: birthday
        weight: 110.0
        label: 40. urodziny
        date: "2026-06-06"
        color: "#3B8BD4"
      - key: summer
        weight: 100.0
        label: Koniec wakacji
        date: "2026-09-07"
        color: "#1D9E75"
      - key: christmas
        weight: 90.0
        label: Wigilia 2026
        date: "2026-12-24"
        color: "#1D9E75"
```

---

## Wymagania

- Home Assistant 2023.0.0+
- Encja wagi musi mieć `state_class: measurement` aby była w long-term statistics HA

---

## Dla wielu użytkowników

Jeden plik `health-card.js` obsługuje wszystkich — każda osoba konfiguruje własną kartę przez YAML z inną encją, wagą startową i celami.
