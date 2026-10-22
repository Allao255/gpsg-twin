// Gerado por scripts/gen-model-types.ts. Não editar à mão.

/**
 * This interface was referenced by `CommandModel`'s JSON-Schema
 * via the `definition` "CommandKind".
 */
export type CommandKind = 'set' | 'query' | 'action';
/**
 * This interface was referenced by `CommandModel`'s JSON-Schema
 * via the `definition` "ParamType".
 */
export type ParamType = 'int' | 'real' | 'string' | 'enum' | 'lat' | 'lon' | 'unit';
/**
 * @minItems 2
 * @maxItems 2
 *
 * This interface was referenced by `CommandModel`'s JSON-Schema
 * via the `definition` "Range".
 */
export type Range = [number, number];
/**
 * This interface was referenced by `CommandModel`'s JSON-Schema
 * via the `definition` "Category".
 */
export type Category =
  | 'calibration'
  | 'channels'
  | 'common'
  | 'diagnostics'
  | 'file'
  | 'general'
  | 'gpsrx'
  | 'help'
  | 'route'
  | 'setup'
  | 'simulation'
  | 'svprn'
  | 'waypoint';

/**
 * Modelo de comandos SCPI do GPSG-1000. Fonte única de comandos, parâmetros, faixas, aliases e travas.
 */
export interface CommandModel {
  $schema_version: 1;
  source: {
    [k: string]: string;
  };
  transport: {
    [k: string]: string | number | boolean;
  };
  conventions: {
    [k: string]: unknown;
  };
  commands: Command[];
}
/**
 * This interface was referenced by `CommandModel`'s JSON-Schema
 * via the `definition` "Command".
 */
export interface Command {
  header: string;
  kind: CommandKind;
  aliases: string[];
  params: Param[];
  query_params: Param[];
  returns: null | Returns;
  example: string | null;
  locked_while_running: boolean | null;
  category: Category;
  manual_page: string;
  notes: string | null;
  discrepancies: string[];
  emit_allowed: boolean;
  verified_on_hw: boolean;
}
/**
 * This interface was referenced by `CommandModel`'s JSON-Schema
 * via the `definition` "Param".
 */
export interface Param {
  name: string;
  type: ParamType;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  unit_suffix?: boolean;
  maxlen?: number;
  /**
   * @minItems 1
   */
  values?: [string, ...string[]];
  default?: string | number;
  notes?: string;
  range_by_port?: {
    DIRECT: Range;
    COUPLER: Range;
  };
  range_by_units?: {
    [k: string]: Range;
  };
  format?: string;
  optional?: boolean;
}
/**
 * This interface was referenced by `CommandModel`'s JSON-Schema
 * via the `definition` "Returns".
 */
export interface Returns {
  type: 'string' | 'real' | 'int' | 'enum' | 'csv' | 'csv_multiline';
  values?: (string | number)[];
  example?: string;
  format?: string;
  format_header?: string;
  example_row?: string;
  unit?: string;
  range?: Range;
  notes?: string;
}
