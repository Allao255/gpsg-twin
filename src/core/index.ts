// API pública do core.
export * from './diagnostics';
export * from './units';
export * from './geo';
export * from './quirks';
export * from './model/load';
export * from './scpi/lexer';
export * from './scpi/header';
export * from './scpi/params';
export * from './scpi/validate';
export * from './scpi/format';
export * from './script/ast';
export * from './script/parse';
export {
  formatScript,
  formatLine,
  canonicalCommand,
  canonicalNumberText,
  type FormatMode,
} from './script/format';
export * from './script/timeline';
export * from './scenario/types';
export * from './scenario/defaults';
export * from './scenario/apply';
export * from './scenario/emit';
export * from './scenario/from-script';
export * from './scenario/json';
