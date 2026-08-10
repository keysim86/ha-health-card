# Changelog

## [1.9.0] - 2026-08-10

### Dodano
- **Woda i mięśnie szkieletowe na wykresie składu ciała** — dwie dodatkowe serie, rysowane tylko gdy odpowiednie encje są skonfigurowane
- **Woda** (linia kropkowana) jest jedyną z nich, która jest **niezależnym pomiarem** z wagi, a nie pochodną masy beztłuszczowej. Dlatego ma własny kształt i realnie coś wnosi: tłumaczy dobowe skoki masy, które bez niej wyglądają na przyrost albo utratę tłuszczu
- **Mięśnie szkieletowe** (linia kreskowana) mają kształt **identyczny** z masą beztłuszczową, bo są jej stałą częścią — różnią się wyłącznie poziomem. Są na wykresie po to, żeby widzieć wartość bezwzględną w kontekście pozostałych, a nie po to, żeby czytać z nich trend. Obie serie celowo bez wypełnienia, żeby nie udawały niezależnych pomiarów

## [1.8.1] - 2026-08-10

### Naprawiono
- **Wykres składu ciała nie rysował się po odświeżeniu strony.** Karta doładowuje Chart.js asynchronicznie, a rysowanie wykresu składu ciała było wywoływane zaraz po `_drawChart` — czyli zanim skrypt zdążył się wczytać. Funkcja wychodziła wtedy po cichu przez własny warunek `if (!window.Chart) return` i wykres nie pojawiał się wcale. Działał wyłącznie wtedy, gdy biblioteka wisiała już w pamięci z poprzedniego renderowania, stąd mylące „raz jest, raz go nie ma". Rysowanie przeniesione do `_initChart`, które uruchamia się dopiero po załadowaniu biblioteki — w obu ścieżkach

## [1.8.0] - 2026-08-10

### Dodano
- **Mięśnie szkieletowe** — kafelek z szacunkiem masy mięśni szkieletowych, nowa opcja `skeletal_muscle`. Algorytmu wagi nie da się odtworzyć (jest zamknięty i korzysta z surowej impedancji, której Health Connect nie przekazuje), ale mięśnie szkieletowe stanowią u dorosłych mniej więcej stałą część masy beztłuszczowej — 50–55% wg literatury. Współczynnik dobiera się raz, porównując z aplikacją wagi

### Zmieniono
- **Wykres składu ciała wrócił do dwóch serii.** Trzecia linia została zdjęta, bo zarówno tkanka beztłuszczowa, jak i mięśnie szkieletowe powstają z masy beztłuszczowej przez pomnożenie albo odjęcie stałej — ich krzywe są **przeskalowaną kopią** zielonej i nie wnosiły żadnej informacji, a odbierały czytelność temu, co na tym wykresie jest istotne: czy czerwona opada szybciej niż zielona. Obie wartości zostały jako kafelki

## [1.7.1] - 2026-08-10

### Naprawiono
- **Kafelek „Masa mięśniowa" był nazwany błędnie.** Liczba (`waga − tłuszcz − kości`) była poprawna, ale to **tkanka miękka beztłuszczowa**: mięśnie *plus* narządy, skóra i woda pozakomórkowa. Aplikacje wag pokazują obok tego „masę mięśniową" mniej więcej o połowę niższą — to masa **mięśni szkieletowych**, liczona własnym algorytmem bioimpedancji. Przy wadze 100,5 kg wychodziło 68,4 kg wobec 39,6 kg z aplikacji, co słusznie wyglądało na błąd
- Kafelek i seria na wykresie nazywają się teraz **„Tkanka beztłuszczowa"**, z podpisem mówiącym wprost, że to nie są mięśnie szkieletowe

### Uwaga
- **Masy mięśni szkieletowych nie da się pobrać przez Health Connect** — nie ma dla niej rekordu, więc aplikacja towarzysząca Home Assistanta nie ma czego wystawić. Jeśli ta wartość jest potrzebna, jedyną drogą jest ręczne wprowadzanie jej z aplikacji wagi

## [1.7.0] - 2026-08-10

### Naprawiono
- **Skład ciała — kafelek „Spalono tłuszczu" pokazywał `+NaN kg`.** Funkcja `_statToDaily` zwraca **tablicę par `[dzień, wartość]`**, a nowy kod składu ciała potraktował ją jak słownik. `Object.keys()` dawało wtedy indeksy tablicy (`"0"`, `"1"`), a pod nimi całe pary zamiast liczb — odejmowanie kończyło się `NaN` i psuło również podpis „reszta". Serie wykresu były z tego samego powodu zbudowane błędnie. Błąd wszedł razem z 1.6.0

### Dodano
- **Masa mięśniowa** — kafelek i trzecia seria na wykresie składu ciała. Liczona wzorem przyjętym przez wagi domowe: `waga − tłuszcz − kości`, bo waga nie podaje jej wprost. Linia celowo bez wypełnienia i kreskowana — biegnie równolegle do masy beztłuszczowej, niżej o masę kostną, i ma być czytana razem z nią, nie zamiast niej
- **Masa kostna** — kafelek. Zmienia się bardzo wolno, więc świadomie nie trafia na wykres: byłaby płaską linią zajmującą miejsce
- Nowe opcje konfiguracji: `muscle_mass`, `bone_mass`

## [1.6.1] - 2026-08-09

### Naprawiono
- **Ciśnienie → Statystyki (30 dni)** — średnia oraz Min/Max liczone były z godzinowych statystyk, przez co **ważyły upływem czasu zamiast liczbą pomiarów**. Sensor ciśnienia trzyma wartość aż do następnego odczytu, więc każda godzina bez pomiaru produkowała kolejną średnią równą ostatniemu wynikowi: wartość wyświetlana przez dwanaście godzin wchodziła do średniej dwanaście razy, a pomiar sprzed kwadransa raz. Statystyka mówiła więc, ile ciśnienie było **pokazywane**, a nie ile wynosiło
- Konsekwencją było też mylące Min/Max: pokazywało skrajne wartości **średnich**, a nie odczytów. Godzina, w której 118 zmieniało się na 123, miała średnią gdzieś pośrodku, więc jako maksimum wychodziło 120 — i **bieżący pomiar potrafił wypaść poza własny zakres 30 dni**
- Statystyki odtwarzają teraz pojedyncze odczyty: godzina stabilna wnosi jedną wartość, godzina z przejściem obie skrajne, a powtórzenia pod rząd są zwijane. Średnia jest średnią z pomiarów, a Min/Max pokazuje realnie zmierzone skrajności

## [1.6.0] - 2026-08-09

### Dodano
- **Skład ciała** — nowa sekcja w zakładce Waga. Kafelki procentu tłuszczu z kategorią, masy tłuszczu, masy beztłuszczowej, wody (w kg i jako procent masy ciała) oraz przemiany podstawowej. Sekcja pojawia się tylko gdy skonfigurowano choć jedną z encji, więc nie zmienia niczego istniejącym instalacjom
- **Wykres masy tłuszczu i masy beztłuszczowej** — dwie serie na jednej osi. Wartość tego wykresu jest w rozjeżdżaniu się linii: tłuszcz ma opadać, masa beztłuszczowa trzymać poziom. Gdy obie schodzą razem, razem z tłuszczem znika masa mięśniowa — a tego sama waga nigdy nie pokaże. Oś Y celowo nie zaczyna się od zera, bo przy zerze różnice rzędu kilograma byłyby niewidoczne
- Nowe opcje konfiguracji: `body_fat`, `fat_mass`, `lean_mass`, `body_water`, `bmr`, `body_fat_gender`, `body_comp_enabled`

### Zmieniono
- Kafelek **„Spalono tłuszczu"** przestał zgadywać. Dotąd pokazywał `utrata × 0,75` — podręcznikową proporcję przyjętą w ciemno, niezależnie od tego, co się faktycznie działo z ciałem. Przy skonfigurowanej encji `fat_mass` pokazuje teraz **realną zmianę masy tłuszczu z pomiarów**, a w podpisie ile z utraty przypadło na resztę ciała. Bez tej encji zachowanie pozostaje bez zmian

## [1.5.0] - 2026-08-04

### Naprawiono
- Bilanse → BMI — na wykresie widoczna była tylko jedna linia progu zamiast wszystkich. Linie referencyjne były w kodzie (18.5, 25, 30, 35), ale oś Y skalowała się wyłącznie do zakresu danych, więc progi leżące poniżej wykresu wypadały poza obszar rysowania. Przy BMI schodzącym z 42 do 31 zostawał widoczny wyłącznie próg 35. Zakres osi rozszerza się teraz do najbliższego progu poniżej i powyżej danych, dzięki czemu zawsze widać granicę, do której się zbliżasz, i tę właśnie przekroczoną

### Dodano
- Bilanse → BMI — brakujący próg **40 (otyłość III°)**; wcześniej najwyższą linią była otyłość II°
- Bilanse → BMI — podpisy przy liniach progów (nazwa kategorii i wartość). Pięć przerywanych linii w zbliżonych kolorach było nieczytelne bez opisu

## [1.4.9] - 2026-07-02

### Naprawiono
- Waga — kafelki "Łączna utrata", "Utrata %", "Średnie tempo" i "Spalono tłuszczu" przy przyroście wagi pokazywały podwójny znak (np. "−-0.15 kg") w kolorze zielonym; teraz przyrost renderuje się jako "+0.15 kg" w kolorze czerwonym, a utrata jak dotąd "−0.15 kg" na zielono (spójnie z kafelkami bilansów)

## [1.4.8] - 2026-06-15

### Naprawiono
- Ciśnienie — "Ostatni pomiar" pokazywał dzisiejszą datę/godzinę mimo że ostatni faktyczny odczyt był wcześniej (HA dopisuje godzinowe statystyki z tą samą wartością bez nowego pomiaru); teraz wyznaczany moment ostatniej faktycznej zmiany wartości
- Pomiary — data pod każdym kafelkiem pokazywała ostatni wpis statystyk dziennych zamiast daty ostatniej faktycznej zmiany wartości; ta sama przyczyna jak w Ciśnieniu, wydzielono wspólną funkcję `_lastChangeTs` i naprawiono oba miejsca

## [1.4.1] - 2026-06-04

### Naprawiono
- Pomiary — wspólna data referencyjna dla wszystkich pomiarów: najnowsza data poprzedniej sesji pomiarowej (max poprzednich dat); eliminuje różne daty porównania na różnych kafelkach i błędny bilans łączny

## [1.4.0] - 2026-05-09

### Dodano
- Kafelek "Utrata %" na zakładce Waga — pokazuje procentowy ubytek masy względem wagi startowej
- Prognozowana data osiągnięcia każdego celu na podstawie aktualnego średniego tempa utraty wagi
- Data osiągnięcia celu (dla celów ukończonych) — pierwsza data z historii gdy waga spadła poniżej progu
- Kafelek "Do normy BMI 25" — ile kg pozostało do zdrowej wagi i prognozowana data
- Kafelek "Następny cel" — najbliższy nieosiągnięty cel i brakująca waga
- Kafelek "Spalono tłuszczu" — szacunek spalonych kg tłuszczu (~75% łącznej utraty)

## [1.3.8] - 2026-05-09

### Naprawiono
- Raport PDF ciśnienia: zmieniono źródło danych z history API na statistics API — teraz poprawnie pobiera wszystkie pomiary z wybranego okresu (history API zwracało tylko 1 wpis dla input_number gdy wartość się nie zmieniała)
- Okno dopasowania sys/dia/pul rozszerzone z 60s do 1h (dostosowane do rozdzielczości statystyk godzinowych)

## [1.3.7] - 2026-05-07

### Naprawiono
- Liczby całkowite w tooltipach wykresu radarowego i bilansu miesięcznego (były jeszcze .0 po przecinku)

## [1.3.6] - 2026-05-07

### Zmieniono
- Pomiary ciała wyświetlane jako liczby całkowite (bez miejsc po przecinku) — wartości, delty, podsumowania, tooltip wykresu radarowego i bilansu miesięcznego

## [1.3.5] - 2026-04-27

### Naprawiono
- Kafelki „Bilans miesiąca" i „Bilans tygodnia" (zakładka Waga): zmieniono metodę liczenia z „pierwszy→ostatni bieżącego okresu" na „ostatni poprzedniego okresu→ostatni bieżącego" — spójna logika z tabelami bilansów

## [1.3.4] - 2026-04-26

### Naprawiono
- Bilanse miesięczne i tygodniowe (Waga) oraz bilans miesięczny cm (Pomiary): zmieniono metodę liczenia z „pierwszy→pierwszy następnego" na „ostatni poprzedniego okresu→ostatni bieżącego" — poprawne porównanie realnych odczytów między okresami

## [1.3.3] - 2026-04-26

### Naprawiono
- Poprzedni unikalny pomiar wyznaczany po zmianie wartości (nie tylko daty) — eliminuje fałszywe −0.0 cm gdy HA nagrywa co godzinę tę samą wartość

### Dodano
- Miesięczny bilans cm — słupkowy wykres łącznej zmiany sumy wszystkich pomiarów per miesiąc

## [1.3.2] - 2026-04-26

### Dodano
- Delta od poprzedniego unikalnego pomiaru w każdym kafelku pomiarów (nad deltą od pierwszego pomiaru)
- Kafelek podsumowania pokazuje dwa wiersze: łącznie od ostatniego pomiaru i łącznie od początku

## [1.3.1] - 2026-04-25

### Naprawiono
- Usunięto duplikat legendy z wykresu historii pomiarów (była wyświetlana dwa razy)
- Zmieniono kolor Bicepsa z żółtego na różowy — wszystkie 8 linii ma teraz wyraźnie różne kolory
- Dodano unikalne wzory kresek dla każdej linii wykresu historii

### Dodano
- Delta od pierwszego pomiaru w każdym kafelku (zielona = utrata, czerwona = przyrost)
- Pasek podsumowania łącznej zmiany wszystkich wymiarów od pierwszego pomiaru

## [1.3.0] - 2026-04-25

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
