const RX_NUMERIC = /^(?:U?TINYINT|U?SMALLINT|U?INTEGER|U?BIGINT|U?HUGEINT|INT(?:EGER)?|DECIMAL(?:\(|$)|DOUBLE|FLOAT|REAL|NUMERIC(?:\(|$))/i;
const RX_TEMPORAL = /^(?:DATE|INTERVAL)$|^TIME(?:$|\s|_)|^TIMESTAMP(?:$|\s|_)|^TIMESTAMPTZ$/i;

export function normalizeSqlType(sqlType) {
  return String(sqlType || '').trim().toUpperCase();
}

export function isNumericSqlType(sqlType) {
  return RX_NUMERIC.test(normalizeSqlType(sqlType));
}

export function isTemporalSqlType(sqlType) {
  return RX_TEMPORAL.test(normalizeSqlType(sqlType));
}

export function isHistogramSqlType(sqlType) {
  return isNumericSqlType(sqlType) || isTemporalSqlType(sqlType);
}
