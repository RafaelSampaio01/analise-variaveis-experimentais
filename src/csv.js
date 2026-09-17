'use strict';
const header = ['ID', 'DATA', 'HORA', 'VALOR', 'UNIDADE', 'SENSOR'];
function encode(rows) {
  const quote = value => /[;"\r\n]/.test(String(value)) ? '"' + String(value).replaceAll('"', '""') + '"' : String(value);
  return '\uFEFF' + [header, ...rows.map(r => [r.id, r.date, r.time, String(r.value).replace('.', ','), r.unit, r.sensor])].map(row => row.map(quote).join(';')).join('\r\n') + '\r\n';
}
function decode(text) {
  const records = []; let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ';' && !quoted) { row.push(field); field = ''; }
    else if ((ch === '\r' || ch === '\n') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); records.push(row); row = []; field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('Arquivo com aspas não fechadas.');
  if (field || row.length) { row.push(field); records.push(row); }
  if (!records.length || records[0].map(v => v.trim().toUpperCase()).join(';') !== header.join(';')) throw new Error('Cabeçalho esperado: ID;DATA;HORA;VALOR;UNIDADE;SENSOR');
  return records.slice(1).filter(r => r.some(v => v.trim())).filter(r => r[0].trim() !== 'ID').map((r, index) => {
    const value = Number(r[3]?.trim().replace(',', '.'));
    if (r.length !== 6 || !r[3].trim() || !Number.isFinite(value)) throw new Error(`Dados inválidos na linha ${index + 2}.`);
    return { id: index, date: r[1], time: r[2], value, unit: r[4].trim(), sensor: r[5].trim() };
  });
}
module.exports = { encode, decode };
