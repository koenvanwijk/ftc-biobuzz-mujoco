/**
 * Pure helpers voor de variabele-hover in de Blocks-editor (debugger).
 *
 * Deze functies draaien op twee plekken: in unit-tests (node) én — als broncode-string via `Function.toString()` —
 * in de vendor-iframe (zie blocksBridge.js). Daarom zijn het zelfstandige functies zonder verwijzingen naar elkaar,
 * externe imports of moderne syntax-afhankelijkheden op module-niveau.
 */

/**
 * Welke variabelen worden door de eigen velden van dit blok gelezen/gezet?
 * (variables_get / variables_set / math_change / controls_for / controls_forEach: veld `VAR`).
 * Kinderen worden bewust niet meegenomen: elk blok in de editor krijgt zijn eigen tooltip.
 * @param {{ inputList?: Array<{ fieldRow?: any[] }> }} block Blockly-blok (duck-typed)
 * @param {(display: string) => string} [toJsName] display-naam → JS-naam (Blockly.JavaScript.variableDB_)
 * @returns {Array<{ name: string, display: string }>} uniek, in volgorde van voorkomen
 */
export function blockVarRefs(block, toJsName) {
  var out = [];
  var seen = {};
  if (!block) return out;
  var inputs = block.inputList || [];
  for (var i = 0; i < inputs.length; i++) {
    var row = (inputs[i] && inputs[i].fieldRow) || [];
    for (var j = 0; j < row.length; j++) {
      var f = row[j];
      if (!f) continue;
      var isVar = f.name === 'VAR' || typeof f.getVariable === 'function';
      if (!isVar || typeof f.getText !== 'function') continue;
      var display = String(f.getText() || '');
      if (!display || seen[display]) continue;
      seen[display] = true;
      var js = display;
      try {
        if (typeof toJsName === 'function') js = String(toJsName(display) || display);
      } catch (e) {
        js = display;
      }
      out.push({ name: js, display: display });
    }
  }
  return out;
}

/**
 * Tooltiptekst ("totaal = 36", één regel per variabele) voor de gegeven referenties, op basis van de laatste
 * variabelen-snapshot van de worker ([{ name, scope, text }]). Lege string = niets te tonen.
 * @param {Array<{ name: string, display?: string }>} refs
 * @param {Array<{ name: string, text: string }> | null} vars
 * @param {number} [maxLines]
 */
export function formatVarTooltip(refs, vars, maxLines) {
  if (!refs || !refs.length || !vars) return '';
  var limit = maxLines || 6;
  var lines = [];
  for (var i = 0; i < refs.length && lines.length < limit; i++) {
    var r = refs[i];
    var hit = null;
    for (var k = 0; k < vars.length; k++) {
      if (vars[k].name === r.name) { hit = vars[k]; break; }
    }
    if (!hit && r.display) {
      for (var m = 0; m < vars.length; m++) {
        if (vars[m].name === r.display) { hit = vars[m]; break; }
      }
    }
    var text = hit ? String(hit.text) : '(niet beschikbaar)';
    if (text.length > 120) text = text.slice(0, 119) + '…';
    lines.push((hit ? hit.name : r.display || r.name) + ' = ' + text);
  }
  if (refs.length > lines.length) lines.push('… (+' + (refs.length - lines.length) + ')');
  return lines.join('\n');
}
