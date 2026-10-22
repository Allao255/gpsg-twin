# Formatos de arquivo (pacote USB)

Fonte: OP Apêndice D, E e F. Formatos marcados "a confirmar" devem ser fechados com arquivos exportados do equipamento na sessão 1; esses arquivos passam a ser golden files de teste (fora do repositório se tiverem conteúdo de ensaio).

## 1. Estrutura do pendrive

FAT16 ou FAT32. O equipamento cria e lê a árvore abaixo da raiz (OP D-1):

```
/Instrument/
    almanacs/     *.alm   Yuma
    Kml/          *.kml   Google Earth
    Nmea/         *.nme   NMEA-0183 (trajetória); *.gdt provavelmente aqui (a confirmar)
    Routes/       *.rte   XML
    Settings/     *.set   XML (extensão a confirmar)
    Waypoint/     *.csv   CSV (nome do arquivo a confirmar)
```

`IMPort` copia do pendrive para a memória interna, `EXPort` copia todos os arquivos daquele tipo da memória interna para o pendrive. `LOAD` usa um arquivo já presente na memória interna. Sequência típica para um cenário preparado fora:

```
GPS:FIL:SET:IMP
GPS:FIL:ROUT:IMP
GPS:FIL:NMEA:IMP
GPS:FIL:ALM:IMP
GPS:FIL:SET:LOAD "twin_s01.set"
GPS:FIL:ALM:LOAD "twin_w2390.alm"
GPS:FIL:ROUT:LOAD "twin_s01.rte"      (dinâmico)
GPS:FIL:NMEA:LOAD "twin_s01.nme"      (trajetória)
```

O pacote gerado pelo twin deve conter só arquivos com prefixo `twin_`, para não colidir com arquivos de outros usuários na importação.

### 1.1 Pacote gerado pelo twin

ZIP sem compressão, determinístico, para descompactar na raiz do pendrive:

```
Instrument/Routes/twin_<cenário>.rte        rota (se houver pontos com coordenadas, D29)
Instrument/Waypoint/twin_<cenário>.csv      waypoints de usuário (se houver, D30)
Instrument/Settings/twin_<cenário>.set      settings (só com tokens observados, D31)
Instrument/almanacs/twin_<nome>.alm         almanaque anexado pelo operador
Instrument/Nmea/twin_<nome>.gdt | .nme      trajetória anexada pelo operador
<cenário>.scpi                              script de sessão
<cenário>.json                              cenário (referência para reabrir no twin)
<cenário>-colavel.ps1                       runner colável com o script embutido
<cenário>-folha.md                          folha de sessão
```

Por padrão o script configura tudo por comandos e os arquivos de rota, waypoints e settings vão como registro. Na exportação, cada um pode ser trocado pela importação e carga do arquivo (`IMP` e `LOAD`), enquanto os formatos não forem confirmados em bancada. Almanaque e trajetória anexados são sempre importados; a trajetória só é carregada com Simulation = Trajectory.

Na leitura de um pacote do twin, o JSON é a referência: script, rota, waypoints e settings do pacote são derivados dele e não são reaplicados; almanaque e trajetória voltam como anexos. Arquivos exportados pelo equipamento (sem JSON) são aplicados sobre o cenário corrente. ZIP com deflate é aceito.

## 2. Almanaque Yuma (`.alm`)

ICD-GPS-870. Um bloco por PRN:

```
******** Week 799 almanac for PRN-01 ********
ID:                         01
Health:                     000
Eccentricity:               0.3730297089E-002
Time of Applicability(s):  61440.0000
Orbital Inclination(rad):   0.9613649345
Rate of Right Ascen(r/s):  -0.7863184676E-008
SQRT(A)  (m 1/2):           5153.619629
Right Ascen at Week(rad):   0.9558857469E+000
Argument of Perigee(rad):   0.444257464
Mean Anom(rad):            -0.1754657556E+001
Af0(s):                    -0.1144409180E-004
Af1(s/s):                   0.0000000000E+000
week:                        799
```

- Inclinação aqui é absoluta (não o delta de 0,3π do formato SEM).
- Semana em módulo 1024 na maioria das fontes. O twin resolve o rollover usando a data de simulação.
- Fontes: exportação do equipamento (almanaque baixado pelo receptor interno) ou o arquivo Yuma publicado pela USCG NAVCEN. O site do twin não baixa nada; o usuário carrega o arquivo.
- Almanaque Galileo no equipamento é fixo e não editável.

## 3. Trajetória GDT (`.gdt`)

Gerada pelo equipamento a partir de KML. CSV com cabeçalho:

```
Notes,Date,Time,Latitude,Longitude,Alt,Desc
$GDT,20000101,000144.00,38.9425699612859,-94.7561817577427,0.000000,3D,*16
$GDT,20000101,000145.00,38.9425695029864,-94.7561783124509,-0.000004,3D,*3F
```

- Campos: data `AAAAMMDD`, hora `hhmmss.ss`, latitude e longitude em graus decimais com sinal, altitude em metros (absoluta), qualidade `3D`, campo vazio, checksum.
- Checksum: XOR de todos os caracteres entre `$` e `*`, incluindo a vírgula final. Conferido contra os exemplos do manual (GDT e NMEA).
- Taxa: o conversor KML produz 1, 2, 4 ou 5 Hz; a taxa aceita na importação direta de GDT gerado fora é a confirmar.
- Formato preferido para trajetórias sintetizadas pelo twin, por ser o formato interno do equipamento.

## 4. Trajetória NMEA (`.nme`)

Sentenças usadas: GGA, RMC, GSV (OP D-3). Mínimo GGA ou RMC. Sem RMC, a data vem do Setup. Com GSV e PRN Signal em "Traj File", o nível por SV segue o SNR gravado, desde que o almanaque seja o da gravação.

```
$GPGGA,150923.000,3856.4506,N,09445.2627,W,1,07,1.1,332.2,M,-30.1,M,,0000*68
$GPRMC,150923.000,A,3856.4506,N,09445.2627,W,0.09,154.82,290113,,,A*79
```

- Arquivos de outros receptores com extensão `.nmea` precisam ser renomeados para a extensão aceita (o manual escreve `.mne` em um ponto e `.nme` em outros; usar `.nme`, que é o que o próprio equipamento grava).
- As anotações de exemplo do manual têm erros (hora e data do exemplo não correspondem aos campos). Seguir a norma NMEA-0183, não o texto explicativo.
- Altitude de GGA é MSL com separação geoidal no campo seguinte. Na leitura, o twin soma os dois (altitude elipsoidal). Se um dia gerar NMEA, deve gravar a separação coerente com o modelo geoidal adotado e documentar qual (EGM96 recomendado).
- Leitura no twin: GGA e RMC da mesma época viram um ponto; GGA sem fix e RMC com status V são ignorados com aviso; sem RMC, os instantes ficam sem data. Arquivo anexado com extensão `.nmea` ou `.txt` recebe `.nme`.

## 5. Rota (`.rte`)

XML. Unidades SI, independentemente do modo de unidades da UI (OP D-6). Os números do exemplo são o double escrito com 16 algarismos significativos (`%.16g`: 9,8 aparece como `9.800000000000001`); o twin grava no mesmo formato, também no settings XML. Waypoint do banco do equipamento na rota não tem coordenadas no twin e impede o arquivo (a rota vai por comandos).

```xml
<Route>
  <Waypoint Longitude="-77.88420000000001" MaxAcceleration="0" MaxClimbRate="0"
            Name="HESKU" Latitude="37.14982222222222" Altitude="1524"
            TargetSpeed="53.64466666666667" TurningCircleRadius="108.5658611334349"/>
  <Waypoint Longitude="-78.83963333333332" MaxAcceleration="9.800000000000001"
            MaxClimbRate="-3.048" Name="RIVKE" Latitude="38.24149166666667"
            Altitude="1249.68" TargetSpeed="53.64466666666667" TurningCircleRadius="100"/>
</Route>
```

| Atributo | Unidade | Significado |
|---|---|---|
| Latitude, Longitude | graus decimais, sul e oeste negativos | |
| Altitude | m | |
| TargetSpeed | m/s | velocidade ao passar pelo ponto |
| MaxAcceleration | m/s² | aceleração máxima lateral e longitudinal até o próximo ponto |
| MaxClimbRate | m/s | razão máxima de subida ou descida até o próximo ponto |
| TurningCircleRadius | m | raio da curva que define o caminho comandado |

Valores 0 em MaxAcceleration e MaxClimbRate no exemplo: comportamento a confirmar, provavelmente o limite do modelo de movimento (D29).

## 6. Settings (`.set`)

XML com `<!DOCTYPE GpsgPowerupConfig>`. Exemplo completo em OP D-7. Estrutura:

```
GpsgPowerupConfig
  SimulationSetup
    SimulationMode        Gps | ...
    Carrier               L1_E1 | ...
    SbasMode              Auto | Off
    SimulationType        Static | Dynamic | Trajectory
    DigitalNoiseMode      Off | On
    FadingMode            None | ...
    PrnSignalType         Fixed | Variable | ...
    PositionSource        User | Gps
    ClockSetting          User | ...
    UserDateTime          AAAA-MM-DDThh:mm:ss
    UnitsType             Imperial | ...
    LatLonFormat          DD°MM'SS.SS" | ...
    RfPortSelection       Coupler | Direct
    RfLevel               dBm
    RouteLooping          0 | 1
    MotionModel type="Unlimited"
      Pedestrian | Automobile | Marine | LowPerfAircraft | HiPerfAircraft | Custom | Unlimited
        @LateralAcceleration @LongitudinalAcceleration (m/s²) @Velocity (m/s)
  ChannelsSetup @Gnss @Galileo @Gps @SingleSbas @Sbas
  IoSetup
    LossValues @Splitter @Coupler @DirectCable @CouplerCable   (dB)
    ExternalRefOutMode    Off | On
    ReferenceSource       Internal | External
    TriggerMode           Auto | External
  DefaultStaticPoint @Longitude @Latitude @Altitude
  DefaultFiles @Trajectory @Route @Almanac
  DiagnosticsSetup
    DiagnosticsMode Off | ...; Frequency "1176.45 MHz"; Amplitude; DopplerError
```

Os tokens de enumeração além dos mostrados no exemplo não estão documentados. Procedimento na sessão 1: para cada parâmetro enumerado, alterar pela interface remota, salvar com `GPS:FIL:SET:SAV`, exportar e registrar o token XML correspondente. Até lá (D31):

- O twin grava o settings XML só quando todos os valores do cenário têm token do exemplo; senão o arquivo não é gerado e o aviso lista os campos sem token. A configuração continua pelo script.
- A leitura aceita também tokens inferidos dos rótulos da UI (`Dynamic`, `Direct`, `On` etc., em `quirks.ts`), com aviso.
- `ChannelsSetup`: `Gnss` e `SingleSbas` correspondem à alocação simples, `Gps`, `Galileo` e `Sbas` à dupla (inferido; D09). Com alocação não definida no cenário, o arquivo não é gerado.
- `MotionModel`: grava os limites de fábrica de cada modelo (D27) e, em Custom, os limites editados. `DiagnosticsSetup` vai como no exemplo (diagnóstico fora do cenário, D21). `DefaultFiles` recebe os arquivos carregados pelo cenário e não é lido de volta.
- Arquivo gravado em UTF-8; na leitura, conteúdo que não é UTF-8 válido é lido como Windows-1252 (o `°` de `LatLonFormat`).

Os tokens observados ficam em `src/core/files/settings-xml.ts`; ao confirmar um token em bancada, movê-lo da tabela inferida de `quirks.ts` para a observada.

Uso recomendado: settings XML é a forma mais robusta de levar a configuração pré-execução inteira de uma vez, com uma única operação de importação e carga, e de registrar exatamente o que estava ativo em um ensaio.

## 7. Waypoints (`.csv`)

Colunas, sem cabeçalho documentado (OP D-8):

| Col. | Campo |
|---|---|
| A | Nome |
| B | Cidade |
| C | País (não usado) |
| D | Código (chave) |
| E | Código ICAO |
| F | Latitude (graus decimais) |
| G | Longitude (graus decimais) |
| H | Altitude (ft no exemplo) |
| I | Offset UTC (não usado) |
| J | 0 (coluna de terminação) |

O twin grava em CRLF, sem cabeçalho, com País = parâmetro remoto `state` (D28) e altitude em ft (D30). Na leitura, linha sem latitude, longitude e altitude numéricas (um cabeçalho, por exemplo) é ignorada com aviso.

## 8. KML (`.kml`)

Caminho criado no Google Earth com altitude absoluta. O equipamento converte para GDT com velocidade máxima, taxa de amostragem e raio mínimo de curva configurados (`GPS:FIL:KML:MVEL`, `STIM`, `MTR`), ou insere os pontos como rota. O manual desaconselha converter trilhas gravadas em KML; trilhas gravadas devem entrar como NMEA. Para o twin, gerar GDT diretamente é preferível a depender da conversão interna.
