// Gerado por scripts/gen-model-types.ts. Não editar à mão.

export const COMMAND_HEADERS = [
  "*CLS",
  "*ESE",
  "*ESE?",
  "*ESR?",
  "*IDN?",
  "*OPC",
  "*OPC?",
  "*OPT?",
  "*RST",
  "*SRE",
  "*SRE?",
  "*STB?",
  "*TST?",
  "*WAI",
  ":SYSTem:ERRor?",
  "GPS:?",
  "GPS:SYST:CPAS",
  "GPS:STAT?",
  "GPS:CAL:RFCV:VALue?",
  "GPS:CAL:RFCV:VALue",
  "GPS:CAL:RFCV:ABORt",
  "GPS:CAL:RFCV:DONE",
  "GPS:CAL:RFCV:STARt",
  "GPS:CAL:RLCV:ABORt",
  "GPS:CAL:RLCV:DONE?",
  "GPS:CAL:RLCV:DONE",
  "GPS:CAL:RLCV:STARt",
  "GPS:CAL:RLCV:VALue?",
  "GPS:CAL:RLCV:VALue",
  "GPS:CAL:RLCV:NEXT",
  "GPS:CAL:RLCV:PREV",
  "GPS:CAL:RLCV:STATus?",
  "GPS:DIAG:AMPLitude",
  "GPS:DIAG:AMPLitude?",
  "GPS:DIAG:DOPPler",
  "GPS:DIAG:DOPPler?",
  "GPS:DIAG:ExtREF",
  "GPS:DIAG:ExtREF?",
  "GPS:DIAG:FREQuency",
  "GPS:DIAG:FREQuency?",
  "GPS:DIAG:LogAMP?",
  "GPS:DIAG:MODe",
  "GPS:DIAG:MODe?",
  "GPS:DIAG:PLLLockstatus?",
  "GPS:DIAG:PLLlock800status?",
  "GPS:DIAG:PLLlockeXternalstatus?",
  "GPS:DIAG:PLllockeXternalRefdetec?",
  "GPS:DIAG:RSRC",
  "GPS:DIAG:RSRC?",
  "GPS:FILe:ALM:CLeaRall",
  "GPS:FILe:ALM:FileLiST?",
  "GPS:FILe:ALM:FileNAMe?",
  "GPS:FILe:ALM:LOAD",
  "GPS:FILe:ALM:REMove",
  "GPS:FILe:ALM:RELoad",
  "GPS:FILe:ALM:DEFault",
  "GPS:FILe:ALM:IMPort",
  "GPS:FILe:ALM:EXPort",
  "GPS:FILe:ROUT:CLeaRall",
  "GPS:FILe:ROUT:DEFaults",
  "GPS:FILe:ROUT:FileLiST?",
  "GPS:FILe:ROUT:FileNAMe?",
  "GPS:FILe:ROUT:LOAD",
  "GPS:FILe:ROUT:REMove",
  "GPS:FILe:ROUT:SAVe",
  "GPS:FILe:ROUT:IMPort",
  "GPS:FILe:ROUT:EXPort",
  "GPS:FILe:SET:CLeaRall",
  "GPS:FILe:SET:DEFault",
  "GPS:FILe:SET:FileLiST?",
  "GPS:FILe:SET:FileNAMe?",
  "GPS:FILe:SET:LOAD",
  "GPS:FILe:SET:REMove",
  "GPS:FILe:SET:SAVe",
  "GPS:FILe:SET:IMPort",
  "GPS:FILe:SET:EXPort",
  "GPS:FILe:KML:CLeaRall",
  "GPS:FILe:KML:FileLiST?",
  "GPS:FILe:KML:FileNAMe?",
  "GPS:FILe:KML:LOAD",
  "GPS:FILe:KML:REMove",
  "GPS:FILe:KML:MaxVELocity",
  "GPS:FILe:KML:MaxVELocity?",
  "GPS:FILe:KML:SamplingTIMe",
  "GPS:FILe:KML:SamplingTIMe?",
  "GPS:FILe:KML:MinTurnRadius",
  "GPS:FILe:KML:MinTurnRadius?",
  "GPS:FILe:NMEA:CLeaRall",
  "GPS:FILe:NMEA:FileLiST?",
  "GPS:FILe:NMEA:FileNAMe?",
  "GPS:FILe:NMEA:LOAD",
  "GPS:FILe:NMEA:IMPort",
  "GPS:FILe:NMEA:EXPort",
  "GPS:FILe:NMEA:DEFault",
  "GPS:FILe:WAYP:IMPort",
  "GPS:FILe:WAYP:EXPort",
  "GPS:FILe:WAYP:CLeaR",
  "GPS:GPSR:AlmanacSTatus?",
  "GPS:GPSR:ActiveSATellite?",
  "GPS:GPSR:ALTitude?",
  "GPS:GPSR:FIX?",
  "GPS:GPSR:CurrentTIMe?",
  "GPS:GPSR:LATitude?",
  "GPS:GPSR:LONGitude?",
  "GPS:GPSR:RECeiver",
  "GPS:GPSR:RECeiver?",
  "GPS:GPSR:RELoad",
  "GPS:GPSR:RESet",
  "GPS:GPSR:SPeeD?",
  "GPS:GPSR:RTRJ",
  "GPS:GPSR:RTRJ?",
  "GPS:ROUT:ADD:POINt",
  "GPS:ROUT:ADD:WAYPoint",
  "GPS:ROUT:DELete",
  "GPS:ROUT:DISPlay?",
  "GPS:ROUT:EDIT",
  "GPS:ROUT:FILe?",
  "GPS:ROUT:LIST?",
  "GPS:ROUT:LOAD",
  "GPS:ROUT:REMove",
  "GPS:ROUT:SAVe",
  "GPS:ROUT:VALiDate",
  "GPS:ROUT:CLeaR",
  "GPS:ROUT:LOOP",
  "GPS:SET:CARRier",
  "GPS:SET:CARRier?",
  "GPS:SETup:CouplerCABle",
  "GPS:SETup:CouplerCABle?",
  "GPS:SET:CaRrierGPs",
  "GPS:SET:CaRrierGAl",
  "GPS:SET:CaRrierGG",
  "GPS:SET:CLOCk",
  "GPS:SET:CLOCk?",
  "GPS:SET:CouplerLOSs",
  "GPS:SET:CouplerLOSs?",
  "GPS:SET:CuRrentMotionModel",
  "GPS:SET:CuRrentMotionModel?",
  "GPS:SET:DATe",
  "GPS:SET:DATe?",
  "GPS:SET:DigitalNOiSe",
  "GPS:SET:DigitalNOiSe?",
  "GPS:SET:DirectCABle",
  "GPS:SET:DirectCABle?",
  "GPS:SET:ExtREF",
  "GPS:SET:ExtREF?",
  "GPS:SET:FADing",
  "GPS:SET:FADing?",
  "GPS:SET:GNSS",
  "GPS:SET:GNSS?",
  "GPS:SET:MaxLATeralacceleration",
  "GPS:SET:MaxLATeralacceleration?",
  "GPS:SET:MaxLONgitudinalacceleration",
  "GPS:SET:MaxLONgitudinalacceleration?",
  "GPS:SET:MaxVELocity",
  "GPS:SET:MaxVELocity?",
  "GPS:SET:PositionSouRCe",
  "GPS:SET:PositionSouRCe?",
  "GPS:SET:PRNSignal",
  "GPS:SET:PRNSignal?",
  "GPS:SET:ReferenceSouRCe",
  "GPS:SET:ReferenceSouRCe?",
  "GPS:SET:RFLeVel",
  "GPS:SET:RFLeVel?",
  "GPS:SET:RFPoRt",
  "GPS:SET:RFPoRt?",
  "GPS:SET:SBAS",
  "GPS:SET:SBAS?",
  "GPS:SET:SimulationTYPe",
  "GPS:SET:SimulationTYPe?",
  "GPS:SET:SplitterLOSs",
  "GPS:SET:SplitterLOSs?",
  "GPS:SET:TIMe",
  "GPS:SET:TIMe?",
  "GPS:SET:TriggerSouRCe",
  "GPS:SET:TriggerSouRCe?",
  "GPS:SET:UNITs",
  "GPS:SET:UNITs?",
  "GPS:SET:MotionModelDEfault",
  "GPS:SET:CHAN:APPLy",
  "GPS:SET:CHAN:AVAILable?",
  "GPS:SET:CHAN:GNSS?",
  "GPS:SET:CHAN:GNSS",
  "GPS:SET:CHAN:SBAS?",
  "GPS:SET:CHAN:SBAS",
  "GPS:SET:CHAN:DUAL:DEFault",
  "GPS:SET:CHAN:DUAL:GAL?",
  "GPS:SET:CHAN:DUAL:GAL",
  "GPS:SET:CHAN:DUAL:GPS?",
  "GPS:SET:CHAN:DUAL:GPS",
  "GPS:SET:CHAN:DUAL:SBAS?",
  "GPS:SET:CHAN:DUAL:SBAS",
  "GPS:SIM:ALTitude",
  "GPS:SIM:ALTitude?",
  "GPS:SIM:AltitudeRATe?",
  "GPS:SIM:DATe?",
  "GPS:SIM:DistanceToGo?",
  "GPS:SIM:ElapsedTIMe?",
  "GPS:SIM:ExtREF?",
  "GPS:SIM:FROM?",
  "GPS:SIM:HEADing?",
  "GPS:SIM:LATitude",
  "GPS:SIM:LATitude?",
  "GPS:SIM:LONGitude",
  "GPS:SIM:LONGitude?",
  "GPS:SIMU:SPeeD?",
  "GPS:SIM:TIMe?",
  "GPS:SIM:TO?",
  "GPS:SIM:ToggleRUN",
  "GPS:SIM:ToggleRUN?",
  "GPS:SIM:GAL:ADVisory?",
  "GPS:SIM:GAL:CARRier?",
  "GPS:SIM:GAL:PRN?",
  "GPS:SIM:GAL:VisibleSVS?",
  "GPS:SIM:GPS:ADVisory?",
  "GPS:SIM:GPS:CARRier?",
  "GPS:SIM:GPS:PRN?",
  "GPS:SIM:GPS:VisibleSVS?",
  "GPS:SIM:SBAS:SBAS?",
  "GPS:SIM:SBAS:VisibleSVS?",
  "GPS:SIM:SBAS:PRN?",
  "GPS:SVPR:GAL:LIST?",
  "GPS:SVPR:GAL:SATellite?",
  "GPS:SVPR:GAL:SATellite",
  "GPS:SVPR:GPS:LIST?",
  "GPS:SVPR:GPS:SATellite?",
  "GPS:SVPR:GPS:SATellite",
  "GPS:WAYP:CLeaR",
  "GPS:WAYP:DELete",
  "GPS:WAYP:DISPlay?",
  "GPS:WAYP:EDIT",
  "GPS:WAYP:NEW",
  "GPS:WAYP:LIST?",
  "GPS:WAYP:USE",
] as const;

export type CommandHeader = (typeof COMMAND_HEADERS)[number];

/** Valores de enumeração por cabeçalho e parâmetro de comandos set. */
export interface ModelEnums {
  "GPS:DIAG:ExtREF": {
    state: "OFF" | "ON";
  };
  "GPS:DIAG:FREQuency": {
    freq: "1176" | "1207" | "1227" | "1278" | "1575";
  };
  "GPS:DIAG:MODe": {
    mode: "OFF" | "CW" | "MODULATED";
  };
  "GPS:DIAG:RSRC": {
    source: "INT" | "EXT";
  };
  "GPS:FILe:KML:SamplingTIMe": {
    rate: "1 Hz" | "2 Hz" | "4 Hz" | "5 Hz";
  };
  "GPS:GPSR:RECeiver": {
    receiver: "INTERNAL" | "UUT";
  };
  "GPS:ROUT:LOOP": {
    loop: "ON" | "OFF";
  };
  "GPS:SET:CARRier": {
    carrier: "L1/E1" | "L2" | "L2C" | "L5/E5" | "L1C";
  };
  "GPS:SET:CaRrierGPs": {
    carrier: "L1" | "L1C" | "L2" | "L2C" | "L5";
  };
  "GPS:SET:CaRrierGAl": {
    carrier: "E1" | "E5" | "E5a";
  };
  "GPS:SET:CaRrierGG": {
    carrier: "L1/E1" | "L5/E5";
  };
  "GPS:SET:CLOCk": {
    clock: "GPSRX" | "USER";
  };
  "GPS:SET:CuRrentMotionModel": {
    model: "PEDESTRIAN" | "AUTOMOTIVE" | "MARINE" | "LOW_PERFORMANCE_AIRCRAFT" | "HIGH_PERFORMANCE_AIRCRAFT" | "CUSTOM" | "UNLIMITED";
  };
  "GPS:SET:DigitalNOiSe": {
    state: "OFF" | "ON";
  };
  "GPS:SET:ExtREF": {
    state: "OFF" | "ON";
  };
  "GPS:SET:FADing": {
    fading: "NONE" | "STATIC" | "PEDESTRIAN" | "VEHICLE" | "AIRCRAFT";
  };
  "GPS:SET:GNSS": {
    gnss: "GPS" | "GALILEO" | "GAL+GPS";
  };
  "GPS:SET:PositionSouRCe": {
    source: "USER" | "GPS";
  };
  "GPS:SET:PRNSignal": {
    prn_signal: "VARIABLE" | "FIXED";
  };
  "GPS:SET:ReferenceSouRCe": {
    reference: "INTERNAL" | "INT" | "EXTERNAL" | "EXT";
  };
  "GPS:SET:RFPoRt": {
    port: "DIRECT" | "COUPLER";
  };
  "GPS:SET:SBAS": {
    status: "AUTO" | "OFF";
  };
  "GPS:SET:SimulationTYPe": {
    type: "STATIC" | "DYNAMIC" | "TRAJECTORY";
  };
  "GPS:SET:TriggerSouRCe": {
    source: "AUTO" | "EXTERNAL";
  };
  "GPS:SET:UNITs": {
    units: "IMPERIAL" | "SI" | "AERO/IMPERIAL" | "AERO/SI";
  };
  "GPS:SVPR:GAL:SATellite": {
    select: "ON" | "OFF";
    health: "GOOD" | "BAD" | "CONNECTED" | "DISCONNECTED";
  };
  "GPS:SVPR:GPS:SATellite": {
    select: "ON" | "OFF";
    health: "GOOD" | "BAD";
  };
}

export type EnumValue<H extends keyof ModelEnums, P extends keyof ModelEnums[H]> = ModelEnums[H][P];
