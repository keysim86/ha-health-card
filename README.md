# Health Card

<p align="center">
  <img src="https://raw.githubusercontent.com/keysim86/ha-health-card/main/icons/health-card.png" alt="Health Card" width="100"/>
</p>

[![Release](https://img.shields.io/github/v/release/keysim86/ha-health-card?style=flat-square)](https://github.com/keysim86/ha-health-card/releases/latest)
[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg?style=flat-square)](https://github.com/keysim86/ha-health-card)
[![HA](https://img.shields.io/badge/Home%20Assistant-2024.1%2B-blue?style=flat-square)](https://www.home-assistant.io/)
[![License](https://img.shields.io/github/license/keysim86/ha-home-dashboard-card.svg)](LICENSE)

> Karta Lovelace do monitorowania zdrowia — waga, pomiary ciała, ciśnienie krwi, aktywność, siatki centylowe. Dane z Home Assistant, raporty PDF.

---

## Zakładki

| Zakładka | Opis |
|---|---|
| ⚖ Waga | Waga ciała, BMI, bilanse bieżące, **skład ciała**, postęp do celów, wykresy historii i BMI, data ostatniego pomiaru |
| 📐 Pomiary | 8 pomiarów ciała, wykres radarowy profilu, bilans miesięczny, historia wieloseryjna |
| 💊 Ciśnienie | Skurczowe, rozkurczowe, puls, statystyki, wykres 90 dni, raport PDF |
| 🏃 Aktywność | Kroki i kalorie — dzienne wykresy słupkowe, cel dzienny, statystyki |
| 📈 Siatki centylowe | BMI i wzrost dziecka na tle norm WHO 2007, strefy centylowe |
| ✏ Wprowadź dane | Ręczny zapis ciśnienia, wzrostu i pomiarów ciała do `input_number` |

Zakładki **Pomiary**, **Ciśnienie** i **Siatki centylowe** można włączać/wyłączać przez YAML.

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

## Funkcje — Skład ciała

Sekcja w zakładce **Waga**, widoczna gdy skonfigurowano choć jedną z encji składu ciała.

- Kafelki: **procent tłuszczu** z kategorią i kolorem, **masa tłuszczu**, **masa beztłuszczowa**, **mięśnie szkieletowe**, **tkanka beztłuszczowa**, **masa kostna**, **woda** (w kg oraz jako procent masy ciała), **przemiana podstawowa**
- **Wykres: masa tłuszczu, masa beztłuszczowa, mięśnie szkieletowe i woda w czasie.** Sens tego wykresu jest w rozjeżdżaniu się linii — czerwona ma opadać, zielona trzymać poziom. Gdy obie schodzą razem, razem z tłuszczem ubywa tkanki beztłuszczowej, a tego sama waga nigdy nie pokaże. **Mięśnie szkieletowe** (linia kreskowana) mają kształt identyczny z masą beztłuszczową, bo są jej stałą częścią — służą do odczytania wartości bezwzględnej, nie trendu. **Woda** (linia kropkowana) jest jedyną z dodatkowych serii, która jest niezależnym pomiarem: tłumaczy dobowe skoki masy, które bez niej wyglądają na przyrost albo utratę tłuszczu
- Kafelek **„Spalono tłuszczu"** w sekcji wagi przestaje być szacunkiem. Dotąd pokazywał `utrata × 0,75`, czyli podręcznikową proporcję wziętą w ciemno. Gdy skonfigurowana jest encja `fat_mass`, kafelek pokazuje **realną zmianę masy tłuszczu** z pomiarów, a w podpisie ile z utraty przypadło na resztę ciała. Bez tej encji zachowuje się jak dotąd
- Wykres pojawia się dopiero przy co najmniej dwóch pomiarach — wcześniej sekcja pokazuje same wartości bieżące

> **Uwaga:** progi kategorii tłuszczu (wg American Council on Exercise) służą wyłącznie do pokolorowania kafelka. Karta nie stawia diagnoz.
>
> **`skeletal_muscle` jest szacunkiem, nie pomiarem.** Algorytmu wagi nie da się odtworzyć — jest zamknięty i korzysta z surowej impedancji, której Health Connect nie przekazuje. Mięśnie szkieletowe stanowią jednak u dorosłych mniej więcej stałą część masy beztłuszczowej (50–55% wg literatury), więc wystarczy współczynnik dobrany raz przez porównanie z aplikacją wagi. **Po kilku ważeniach warto sprawdzić, czy liczby się nie rozjeżdżają** — jeśli algorytm wagi uwzględnia wiek albo wzrost, proporcja będzie powoli dryfować.
>
> **`muscle_mass` to NIE są mięśnie szkieletowe.** Wartość `waga − tłuszcz − kości` opisuje **tkankę miękką beztłuszczową**: mięśnie *plus* narządy, skórę i wodę pozakomórkową. Aplikacje wag pokazują obok tego „masę mięśniową" mniej więcej o połowę niższą — masy mięśni szkieletowych **nie da się pobrać przez Health Connect**, bo nie ma dla niej rekordu. Jeśli ta wartość jest potrzebna, jedyną drogą jest ręczne wprowadzanie jej z aplikacji wagi.

## Funkcje — Pomiary ciała

- 8 wymiarów: szyja, klatka piersiowa, brzuch, talia, biodra, udo, łydka, biceps
- Kafelki z aktualną wartością, datą ostatniego pomiaru i **dwiema deltami**: od poprzedniego pomiaru (inna wartość) i od pierwszego pomiaru
- Kafelek podsumowania: łączna zmiana sumy cm od ostatniego pomiaru i od początku
- **Wykres radarowy** aktualnego profilu (znormalizowany 0–100% zakresu każdego wymiaru)
- **Bilans miesięczny** — słupkowy wykres zmiany łącznej sumy wszystkich pomiarów per miesiąc (zielony = utrata, czerwony = przyrost)
- **Historia** — wieloseryjna linia, każdy wymiar innym kolorem i wzorem kreski, do 2 lat wstecz
- Formularz zapisu w zakładce „Wprowadź dane" — zapis wszystkich 8 wymiarów jednym przyciskiem
- Zakładka ukrywana gdy brak konfiguracji lub `measurements_enabled: false`

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
- Formularz zapisu 8 pomiarów ciała do `input_number` — jeden przycisk zapisuje wszystkie wypełnione pola
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

# --- Skład ciała (opcjonalne) ---
body_fat:   sensor.tluszcz             # procent tłuszczu
fat_mass:   sensor.masa_tluszczu       # masa tłuszczu w kg
lean_mass:  sensor.masa_beztluszczowa  # masa beztłuszczowa w kg
body_water:  sensor.woda               # woda w kg
muscle_mass:     sensor.tkanka_beztluszczowa   # waga − tłuszcz − kości
skeletal_muscle: sensor.miesnie_szkieletowe    # szacunek masy mięśni szkieletowych
bone_mass:   sensor.masa_kostna         # masa kostna w kg
bmr:         sensor.przemiana_podstawowa
body_fat_gender: male                  # male | female — progi kategorii tłuszczu
body_comp_enabled: true                # false = ukrywa sekcję Skład ciała

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

# --- Pomiary ciała ---
measurements_enabled: true             # false = ukrywa zakładkę Pomiary
measurements:
  neck:
    entity: sensor.pomiar_szyja        # sensor ze state_class: measurement (historia)
    input: input_number.pomiar_szyja   # input_number do zapisu
  chest:
    entity: sensor.pomiar_klatka
    input: input_number.pomiar_klatka
  abdomen:
    entity: sensor.pomiar_brzuch
    input: input_number.pomiar_brzuch
  waist:
    entity: sensor.pomiar_talia
    input: input_number.pomiar_talia
  hips:
    entity: sensor.pomiar_biodra
    input: input_number.pomiar_biodra
  thigh:
    entity: sensor.pomiar_udo
    input: input_number.pomiar_udo
  calf:
    entity: sensor.pomiar_lydka
    input: input_number.pomiar_lydka
  biceps:
    entity: sensor.pomiar_biceps
    input: input_number.pomiar_biceps

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
