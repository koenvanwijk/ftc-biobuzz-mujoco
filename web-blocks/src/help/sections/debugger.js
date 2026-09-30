/**
 * Help-sectie: debugger (PR #13, feat/blocks-step-debugger).
 *
 * Bewust een apart bestand: alleen opnemen als de debugger in de app zit.
 * `isAvailable(doc)` controleert of de Debug-knop (#btnDebug) bestaat; zonder
 * die knop slaat helpContent.js deze sectie over. Wil je de sectie altijd
 * tonen/verbergen, zet dan DEBUGGER_FORCE op true/false.
 */

/** null = automatisch detecteren, true = altijd tonen, false = altijd verbergen. */
export const DEBUGGER_FORCE = null;

/** Is de debugger aanwezig in de pagina? */
export function isAvailable(doc = globalThis.document) {
  if (DEBUGGER_FORCE !== null) return DEBUGGER_FORCE;
  return !!doc?.getElementById?.('btnDebug');
}

export default {
  id: 'debugger',
  title: 'Debugger',
  isAvailable,
  html: `
<p>Met de debugger loop je je blokken één voor één door en kijk je naar de waarden van je variabelen.</p>

<h3>Aanzetten</h3>
<ol>
  <li>Open een voorbeeld (probeer <em>DebugDemo</em>) of bouw je eigen blokken en klik op <strong>Code vernieuwen</strong>.</li>
  <li>Klik op <strong>Debug</strong> (werkbalk). De knop kleurt geel en de debugknoppen (Stap, Doorgaan, …) worden actief. Dit kan alleen <em>vóór INIT</em> (en niet terwijl een OpMode loopt).</li>
  <li>Klik op <strong>INIT</strong>. De OpMode pauzeert bij het eerste blok: dat blok krijgt een gele rand in de editor en de run-status toont <em>Gepauzeerd bij blok: …</em>.</li>
</ol>

<h3>Knoppen</h3>
<table class="help-table">
  <thead><tr><th>Knop</th><th>Wat doet het?</th></tr></thead>
  <tbody>
    <tr><td><strong>Stap</strong></td><td>Voert het volgende blok uit en pauzeert weer. Stapt <em>in</em> functies (procedures): de blokken van de functie worden één voor één gemarkeerd.</td></tr>
    <tr><td><strong>Stap over</strong></td><td>Voert het huidige blok uit. Is dat een functie-aanroep, dan draait de hele functie in één keer. Breakpoints in die functie pauzeren nog wel.</td></tr>
    <tr><td><strong>Stap uit</strong></td><td>Draait door tot de huidige functie klaar is en pauzeert bij het volgende blok in de aanroeper. Alleen actief binnen een functie (niet direct in <code>runOpMode</code>).</td></tr>
    <tr><td><strong>Doorgaan</strong></td><td>Draait door tot het volgende breakpoint, tot je op Pauzeer klikt, of tot het einde.</td></tr>
    <tr><td><strong>Pauzeer</strong></td><td>Pauzeert bij het eerstvolgende blok, ook tijdens <code>sleep</code>, <code>idle</code> of <code>waitForStart</code>.</td></tr>
    <tr><td><strong>● Breakpoint</strong></td><td>Selecteer eerst een statement-blok in de editor en klik dan: breakpoint aan of uit (rode stippelrand). De teller (<em>n BP</em>) laat zien hoeveel er zijn.</td></tr>
    <tr><td><strong>Wis BP</strong></td><td>Verwijdert alle breakpoints.</td></tr>
  </tbody>
</table>
<p><strong>STOP</strong> werkt ook tijdens een pauze.</p>

<h3>Wat gebeurt er met de simulatie?</h3>
<p>Tijdens een pauze staat <strong>alles stil</strong>: je OpMode, de fysica en de simulatietijd. Motoren houden hun laatste commando; telemetry blijft zichtbaar. Bij <em>Stap</em> loopt er geen simtijd voorbij, tenzij het blok zelf wacht (<code>sleep</code>, <code>idle</code>, <code>waitForStart</code>); dan loopt de sim tot de wacht voorbij is en pauzeert daarna weer.</p>

<h3>Variabelen-paneel</h3>
<p>Bij elke pauze verschijnt het paneel <strong>Variabelen</strong> met alle variabelen en hun waarde (<em>lok</em> = lokaal in de functie, <em>glob</em> = globaal).</p>
<ul>
  <li><strong>Geel</strong>: variabele die het <em>vorige</em> blok net heeft gezet. De waarde is die <em>na</em> het uitvoeren.</li>
  <li><strong>Blauw</strong>: variabele die het <em>huidige</em> (nog niet uitgevoerde) blok leest.</li>
  <li><strong>Grijs</strong>: verouderd, tussen twee pauzes (na Stap of Doorgaan).</li>
</ul>
<p>Lange tekst wordt afgekapt en grote lijsten/objecten worden ingekort; functies en simulator-objecten zie je niet.</p>

<h3>Waarden bij hover</h3>
<p>Tijdens een pauze kun je ook met de muis boven een blok in de editor gaan: er verschijnt een klein kader bij de cursor met de waarde van de variabelen in dat blok, bijvoorbeeld <code>totaal = 36</code>. Dit werkt bij blokken als <em>set</em>, <em>change</em>, <em>for</em> en bij een variabele-blok. Het kader verdwijnt zodra je Stap, Doorgaan of STOP gebruikt. Ga je met de muis over een variabele in het paneel, dan krijgen alle blokken met die variabele een blauwe rand.</p>
<p>De statusregel (<em>Gepauzeerd bij blok: …</em>) heeft een vaste breedte: is de tekst te lang, dan eindigt hij op <code>…</code>. Houd de muis erboven voor de volledige tekst.</p>

<h3>Nog niet mogelijk</h3>
<p>Eigen watch-expressies, variabelen aanpassen tijdens een pauze, voorwaardelijke breakpoints, en breakpoints die een herlaad van het project overleven.</p>
<p class="help-note">Debug uitzetten geeft weer de gewone run; het JS-paneel bevat nooit debug-hulpcode.</p>
`,
};
