# Changelog

## [Unreleased]

### Dodano
- Zakładka **Pomiary** (obok Waga) z 8 pomiarami ciała: szyja, klatka, brzuch, talia, biodra, udo, łydka, biceps
- Wykres radarowy aktualnego profilu pomiarów (znormalizowany 0–100%)
- Wykres historii pomiarów (linia wieloseryjna, do 2 lat wstecz)
- Sekcja **Pomiary ciała** w zakładce "Wprowadź dane" — zapis wszystkich 8 wymiarów jednym przyciskiem
- Opcja `measurements_enabled: false` do ukrycia zakładki Pomiary
- Konfiguracja `measurements` w YAML karty: klucze `neck`, `chest`, `abdomen`, `waist`, `hips`, `thigh`, `calf`, `biceps`, każdy z polami `entity` (sensor ze statystykami) i `input` (input_number do zapisu)

## [1.2.1] - 2026-03-27

### Fixed
- Zakładka Waga: data ostatniego pomiaru wyznaczana z ostatniej zmiany wartości w statystykach (restart-safe) — poprzednie podejście przez `last_changed` resetowało się po restarcie HA

## [1.2.0] - 2026-03-27

### Fixed
- Zakładka Waga: data w kafelku "Aktualnie" pochodzi z `last_changed` encji HA (rzeczywisty moment pomiaru) zamiast ostatniej daty ze statystyk

## [1.1.9] - 2026-03-26

### Dodano
- Wyświetlanie czasu ostatniego pomiaru ciśnienia na stronie ciśnienia

## [1.1.6] - 2026-03-24

### Zmieniono
- Workflow najpierw pushuje tag na GitHub przed stworzeniem release

## [1.1.5] - 2026-03-24

### Zmieniono
- Release notes zawierają tylko sekcję aktualnej wersji (nie cały changelog)

## [1.1.4] - 2026-03-24

### Zmieniono
- Zastąpiono gh CLI czystym curl do GitHub API

## [1.1.3] - 2026-03-24

### Zmieniono
- Poprawiono workflow release — zastąpiono softprops/action-gh-release czystym curl + gh CLI

## [1.1.2] - 2026-03-24

### Zmieniono
- Dodano workflow automatycznego release (Forgejo → GitHub)
- Dodano LICENSE, .gitignore

## [1.1.1] - 2026-03-23

### Dodano
- Opis siatek centylowych w README

## [1.1.0] - 2026-03-23

### Dodano
- Strona centyli z konfiguracją `centile_birthdate` i fallbackiem na `report_birthdate`
- Opcja `goals_enabled` — możliwość wyłączenia sekcji celów
- Wizualizacja norm BMI w raporcie
- Wykresy miesięcznych średnich wagi i BMI

### Poprawiono
- Stylizacja podpowiedzi (hint) i dynamiczne kolory ticów na wykresach
- Układ strony — właściwość `overflow-x: clip`

## [1.0.0] - 2026-03-23

### Dodano
- Strona wagi: pomiary, historia, bilans miesięczny i tygodniowy ze średnimi
- Strona ciśnienia: pobieranie danych, filtrowanie duplikatów, eksport PDF
- Strona aktywności: kroki i kalorie
- Strona ustawień: konfiguracja encji, wykluczanie timestampów z pomiarów
- Nawigacja: przyciski zakładek, sticky pasek nawigacji
- Rejestracja jako custom card w HACS
