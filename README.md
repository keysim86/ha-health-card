# Health Card

<p align="center">
  <img src="icons/health-card.svg" alt="Health Card" width="80" height="80"/>
</p>

<p align="center">
  Karta Lovelace do śledzenia wagi ciała dla Home Assistant.
</p>

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

## Instalacja przez HACS

1. HACS → Interfejs użytkownika → (3 kropki) → Repozytoria niestandardowe
2. URL: `https://github.com/keysim86/ha-health-card`
3. Kategoria: `Lovelace`
4. Kliknij Dodaj → znajdź "Health Card" → Pobierz

## Instalacja ręczna

Skopiuj `health-card.js` do `/config/www/` i dodaj zasób w HA:

**Ustawienia → Pulpity nawigacyjne → Zasoby → Dodaj zasób**
- URL: `/local/health-card.js`
- Typ: `JavaScript module`

## Konfiguracja

```yaml
title: Grzegorz Waga
path: grzegorz-waga
panel: true
cards:
  - type: custom:health-card
    entity_id: sensor.pixel_weight          # encja wagi (wymagane)
    start_weight: 134.5                      # waga startowa w kg
    start_date: "2025-10-30"                 # data startu
    height_cm_entity: input_number.wzrost   # encja wzrostu (opcjonalne)
    height_cm: 178                           # wzrost w cm (fallback)
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

## Wymagania

- Home Assistant 2023.0.0+
- Encja wagi musi mieć `state_class: measurement` aby była w long-term statistics HA

## Dostosowanie

Karta jest w pełni uniwersalna — każda osoba może mieć własną konfigurację YAML z inną encją, wagą startową i celami. Jeden plik `health-card.js` obsługuje wszystkich użytkowników.
