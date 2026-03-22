# Health Card

Karta Lovelace do śledzenia wagi ciała dla Home Assistant.

## Funkcje

- Aktualna waga, łączna utrata, średnie tempo
- BMI z kategorią i paskiem wizualnym
- Postęp do celów wagowych
- Bilanse miesięczne i tygodniowe (z paskami)
- Wykres historii z trendem 7-dniowym
- Przełącznik zakresu wykresu: od początku / 6 mies. / 3 mies. / 1 mies.
- Dane z long-term statistics + short-term statistics (ostatnie 48h)
- W pełni konfigurowalny przez YAML — jeden plik JS dla wielu użytkowników

## Instalacja przez HACS

1. HACS → Interfejs użytkownika → (3 kropki) → Repozytoria niestandardowe
2. URL: `https://github.com/TWOJ_USER/ha-health-card`
3. Kategoria: `Lovelace`
4. Kliknij Dodaj → znajdź "Health Card" → Pobierz

## Instalacja ręczna

Skopiuj `health-card.js` do `/config/www/` i dodaj zasób:
```yaml
url: /local/health-card.js
type: module
```

## Konfiguracja

```yaml
type: custom:health-card
entity_id: sensor.pixel_weight          # encja wagi (wymagane)
start_weight: 90.0                       # waga startowa w kg
start_date: "2025-01-01"                 # data startu
height_cm_entity: input_number.wzrost   # encja wzrostu (opcjonalne)
height_cm: 175                           # wzrost w cm (fallback)
history_days: 365                        # ile dni historii pobierać
goals:
  - key: blood_donation                  # unikalny klucz (blood_donation = specjalny alert)
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

## Wymagania

- Encja wagi musi mieć `state_class: measurement` żeby była w long-term statistics HA
- Home Assistant 2023.0.0+
