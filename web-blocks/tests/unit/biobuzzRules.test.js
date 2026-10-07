/**
 * BIOBUZZ-spelregels (pure logica): kantelregel (Event Field Setup Guide §12.3), G407-constante,
 * score-rijen (Competition Manual TU03 §10.5, Table 10-2 / 10-3) en het score-paneel.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldTip } from '../../src/worlds/biobuzz/hive_tip.js';
import {
  HOPPER_CAPACITY,
  NECTAR_HOPPER_CAPACITY,
  ROBOT_CONTROL_LIMIT,
  TIP_NECTAR_REQUIRED,
  TIP_POLLEN_ALONE,
  TIP_POLLEN_WITH_NECTAR,
} from '../../src/worlds/biobuzz/constants.js';
import {
  RP_THRESHOLDS,
  SCORE_POINTS,
  circleTouchesRect,
  computeScore,
  footprintTouchesRect,
  scoreFlower,
  wallClearance,
} from '../../src/worlds/biobuzz/scoring.js';
import { SCORE_ROWS, scoreNoteText, scoreRowsHtml } from '../../src/ui/scorePanel.js';

describe('HIVE-kantelregel (Guide §12.3: 8 POLLEN of 3 NECTAR + 3 POLLEN)', () => {
  it('constanten volgen de Guide', () => {
    assert.equal(TIP_POLLEN_ALONE, 8);
    assert.equal(TIP_NECTAR_REQUIRED, 3);
    assert.equal(TIP_POLLEN_WITH_NECTAR, 3);
  });
  for (const [n, p] of [[3, 3], [0, 8], [4, 3], [3, 4], [1, 8], [6, 5], [0, 9]]) {
    it(`kantelt bij ${n} NECTAR + ${p} POLLEN`, () => assert.equal(shouldTip(n, p), true));
  }
  for (const [n, p] of [[0, 7], [3, 2], [2, 3], [2, 7], [6, 0], [8, 2], [0, 0], [3, 0]]) {
    it(`houdt bij ${n} NECTAR + ${p} POLLEN`, () => assert.equal(shouldTip(n, p), false));
  }
});

describe('G407: maximaal 4 elementen', () => {
  it('limiet 4, geen compartiment groter dan de limiet', () => {
    assert.equal(ROBOT_CONTROL_LIMIT, 4);
    assert.ok(HOPPER_CAPACITY <= ROBOT_CONTROL_LIMIT);
    assert.ok(NECTAR_HOPPER_CAPACITY <= ROBOT_CONTROL_LIMIT);
  });
});

describe('Puntwaarden en RP-drempels (Table 10-2 / 10-3)', () => {
  it('Table 10-2', () => {
    assert.deepEqual(
      { ...SCORE_POINTS },
      { LEAVE: 3, PARK_AUTO: 5, PARK_TELEOP: 5, TIP: 20, CELL: 2, FLOWER_OWNED: 2, BOTTOM_NECTAR: 5, GARDEN: 1 },
    );
  });
  it('Table 10-3 (All Other Events)', () => {
    assert.deepEqual({ ...RP_THRESHOLDS }, { SWARM: 16, POLLINATOR_1: 4, POLLINATOR_2: 7 });
  });
});

describe('FLOWER: eigenaar en onderste NECTAR (§10.5.2)', () => {
  it('zonder NECTAR geen eigenaar en geen bonus', () => {
    assert.deepEqual(scoreFlower([{ kind: 'pollen', z: 0.2 }, { kind: 'pollen', z: 0.3 }]), {
      owner: null,
      bottom: null,
      count: 2,
    });
  });
  it('bovenste NECTAR = eigenaar, onderste NECTAR = bonus, alle elementen tellen voor de eigenaar', () => {
    const f = [
      { kind: 'nectar', color: 'blue', z: 0.15 },
      { kind: 'pollen', z: 0.22 },
      { kind: 'nectar', color: 'red', z: 0.3 },
      { kind: 'pollen', z: 0.37 },
    ];
    assert.deepEqual(scoreFlower(f), { owner: 'red', bottom: 'blue', count: 4 });
  });
});

describe('computeScore: rijen per alliantie', () => {
  const snap = {
    tips: { red: 4, blue: 7 },
    cell: { red: 3, blue: 1 },
    flowers: [
      [
        { kind: 'nectar', color: 'blue', z: 0.15 },
        { kind: 'pollen', z: 0.22 },
        { kind: 'nectar', color: 'red', z: 0.3 },
      ],
      [{ kind: 'nectar', color: 'red', z: 0.15 }, { kind: 'pollen', z: 0.22 }],
      [{ kind: 'pollen', z: 0.22 }],
      [],
    ],
    garden: { red: 5, blue: 2 },
    robots: [{ alliance: 'red', leave: true, park: true }],
  };
  const s = computeScore(snap);
  it('TIP 20, CELL 2, FLOWER 2, bonus 5, GARDEN 1, LEAVE 3, PARK 5', () => {
    assert.deepEqual(
      Object.fromEntries(['tips', 'cell', 'flower', 'bottomNectar', 'garden', 'leave', 'park'].map((k) => [k, s.red[k].pts])),
      { tips: 80, cell: 6, flower: 10, bottomNectar: 5, garden: 5, leave: 3, park: 5 },
    );
    assert.equal(s.red.flower.owned, 2);
    assert.equal(s.red.total, 80 + 6 + 10 + 5 + 5 + 3 + 5);
    assert.deepEqual(
      Object.fromEntries(['tips', 'cell', 'flower', 'bottomNectar', 'garden', 'leave', 'park'].map((k) => [k, s.blue[k].pts])),
      { tips: 140, cell: 2, flower: 0, bottomNectar: 5, garden: 2, leave: 0, park: 0 },
    );
    assert.equal(s.blue.total, 149);
  });
  it('RP: POLLINATOR 1 bij 4 TIPS, POLLINATOR 2 bij 7, SWARM pas bij 16 LEAVE+PARK', () => {
    assert.equal(s.red.rp.pollinator1.earned, true);
    assert.equal(s.red.rp.pollinator2.earned, false);
    assert.equal(s.blue.rp.pollinator2.earned, true);
    assert.equal(s.red.rp.swarm.value, 8);
    assert.equal(s.red.rp.swarm.earned, false);
    assert.equal(s.red.rpTotal, 1);
    assert.equal(s.blue.rpTotal, 2);
    const two = computeScore({ ...snap, robots: [
      { alliance: 'red', leave: true, park: true },
      { alliance: 'red', leave: true, park: true },
    ] });
    assert.equal(two.red.rp.swarm.value, 16);
    assert.equal(two.red.rp.swarm.earned, true);
  });
  it('lege snapshot = 0', () => {
    const z = computeScore({});
    assert.equal(z.red.total, 0);
    assert.equal(z.blue.total, 0);
  });
});

describe('Zones: GARDEN-overlap, PARK-footprint, LEAVE-muurafstand', () => {
  const garden = { x0: -1.8288, x1: -1.2448, y0: -1.8288, y1: -1.7778 };
  it('POLLEN deels in de GARDEN telt, net ernaast niet', () => {
    assert.equal(circleTouchesRect(-1.5, -1.76, 0.0356, garden), true); // rand overlapt
    assert.equal(circleTouchesRect(-1.5, -1.70, 0.0356, garden), false);
  });
  const fp = { x0: -0.26, x1: 0.25, y0: -0.19, y1: 0.19 };
  const zone = { x0: -1.8288, x1: -1.5493, y0: -1.6788, y1: -1.0948 };
  it('robot deels in de LOADING ZONE = PARK, ook gedraaid', () => {
    assert.equal(footprintTouchesRect(-1.3, -1.4, 0, fp, zone), true); // achterkant tot -1.56
    assert.equal(footprintTouchesRect(-1.3, -1.4, Math.PI, fp, zone), true); // voorkant tot -1.55
    assert.equal(footprintTouchesRect(-1.2, -1.4, 0, fp, zone), false); // achterkant -1.46: net erbuiten
    assert.equal(footprintTouchesRect(-1.3, -0.6, Math.PI / 4, fp, zone), false);
  });
  it('muurafstand: 0 tegen de muur, positief los ervan', () => {
    assert.ok(Math.abs(wallClearance(-1.8288 + 0.26, -1.0, 0, fp)) < 1e-9);
    assert.ok(wallClearance(-1.5, -1.0, 0, fp) > 0.06);
    assert.ok(wallClearance(-1.8288 + 0.2, -1.0, 0, fp) < 0);
  });
});

describe('Score-paneel', () => {
  const s = {
    ...computeScore({ tips: { red: 1, blue: 0 }, robots: [{ alliance: 'red', leave: true, park: false }] }),
    settled: false,
    moving: 2,
  };
  it('één rij per scoreregel + totaal + 2 RP-rijen, Nederlandse labels', () => {
    const html = scoreRowsHtml(s);
    assert.equal((html.match(/<tr/g) || []).length, SCORE_ROWS.length + 3);
    assert.match(html, /HIVE TIP ×20<\/td><td class="sc-red">20 <small>\(1\)<\/small>/);
    assert.match(html, /LEAVE\* \+3<\/td><td class="sc-red">3/);
    assert.match(html, /Totaal<\/td><td class="sc-red">23<\/td><td class="sc-blue">0/);
    assert.match(html, /POLLINATOR RP/);
  });
  it('voetnoot noemt indicatief/klok en bewegende elementen', () => {
    assert.match(scoreNoteText(s), /indicatief: nog geen wedstrijdklok/);
    assert.match(scoreNoteText(s), /2 in beweging/);
    assert.doesNotMatch(scoreNoteText({ ...s, settled: true }), /beweging/);
  });
});
