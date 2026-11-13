#!/usr/bin/env node
/**
 * Tiny compiler: a restricted JavaScript subset → FTC Blocks .blk (Blockly XML).
 * Used to author the BIOBUZZ strategy examples (examples/StarterBot_*Strategy*.blk) as readable
 * source in scripts/strategies/*.src.js. The output is ordinary FTC Blocks: open it in the editor.
 *
 * Supported: top-level `function name(args) { ... }` (a final `return expr;` makes it a
 * procedure with output), assignments (=, +=, -=), if / else if / else, while, for (const v of list),
 * calls to your own functions, arithmetic (+ - * / ** %), comparisons, && || !, unary minus,
 * numbers, strings, true/false, and these intrinsics (each maps to one FTC block):
 *   statements: comment(text), drive(l, r), resetEncoders(), initDrive(), initImu(), resetYaw(),
 *     initVision(), waitForStart(), sleep(ms), setPower('flywheel'|'intakeMotor', p),
 *     text(key, value), num(key, value), update()
 *   values: runtime(), active(), yaw(), leftPos(), rightPos(), detections(), isCluster(d),
 *     clusterName(d), pose(d, 'ftcPose.x'|'ftcPose.y'|'ftcPose.z'|'ftcPose.bearing'|...),
 *     Math.abs(x), Math.sqrt(x), Math.round(x), clamp(x, lo, hi), sinDeg(x), cosDeg(x), atanDeg(x)
 * A JSDoc block comment right before a function becomes the procedure's comment.
 *
 * Usage: node scripts/strategies/js2blk.mjs <src.js> <out.blk>
 */
import fs from 'node:fs';
import { parseAst } from 'rollup/parseAst';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function compile(src) {
  const ast = parseAst(src);
  const vars = new Set();
  const typedVars = { myVisionPortalBuilder: 'VisionPortal.Builder' };
  const procs = new Map(); // name -> { params, returns }
  // JSDoc comments (rollup's parseAst drops comments; scan the source ourselves).
  const docs = new Map();
  for (const m of src.matchAll(/\/\*\*([\s\S]*?)\*\/\s*function\s+(\w+)/g)) {
    docs.set(m[2], m[1].split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim()).filter(Boolean).join(' '));
  }
  for (const fn of ast.body) {
    if (fn.type !== 'FunctionDeclaration') throw new Error(`only function declarations at top level (got ${fn.type})`);
    const body = fn.body.body;
    const last = body[body.length - 1];
    procs.set(fn.id.name, { params: fn.params.map((p) => p.name), returns: !!(last && last.type === 'ReturnStatement') });
    for (const p of fn.params) vars.add(p.name);
  }
  const v = (name) => { vars.add(name); return `<field name="VAR" id="v_${name}">${name}</field>`; };
  const get = (name) => `<block type="variables_get">${v(name)}</block>`;
  const numB = (n) => `<block type="math_number"><field name="NUM">${n}</field></block>`;
  const textB = (s) => `<block type="text"><field name="TEXT">${esc(s)}</field></block>`;
  const val = (name, xml) => `<value name="${name}">${xml}</value>`;
  const str = (node) => {
    if (node.type !== 'Literal' || typeof node.value !== 'string') throw new Error('expected a string literal');
    return node.value;
  };
  const arith = { '+': 'ADD', '-': 'MINUS', '*': 'MULTIPLY', '/': 'DIVIDE', '**': 'POWER' };
  const cmp = { '==': 'EQ', '===': 'EQ', '!=': 'NEQ', '!==': 'NEQ', '<': 'LT', '<=': 'LTE', '>': 'GT', '>=': 'GTE' };
  const motorField = (side) => `<field name="IDENTIFIER">${side}DriveAsDcMotor</field><field name="PROP">CurrentPosition</field><data>{"IDENTIFIER":"${side}Drive"}</data>`;

  function expr(n) {
    switch (n.type) {
      case 'Literal':
        if (typeof n.value === 'number') return numB(n.value);
        if (typeof n.value === 'string') return textB(n.value);
        if (typeof n.value === 'boolean') return `<block type="logic_boolean"><field name="BOOL">${n.value ? 'TRUE' : 'FALSE'}</field></block>`;
        throw new Error('unsupported literal');
      case 'Identifier':
        return get(n.name);
      case 'UnaryExpression':
        if (n.operator === '-' && n.argument.type === 'Literal' && typeof n.argument.value === 'number') return numB(-n.argument.value);
        if (n.operator === '-') return `<block type="math_single"><field name="OP">NEG</field>${val('NUM', expr(n.argument))}</block>`;
        if (n.operator === '!') return `<block type="logic_negate">${val('BOOL', expr(n.argument))}</block>`;
        throw new Error(`unary ${n.operator}`);
      case 'BinaryExpression':
        if (n.operator === '%') return `<block type="math_modulo">${val('DIVIDEND', expr(n.left))}${val('DIVISOR', expr(n.right))}</block>`;
        if (arith[n.operator]) return `<block type="math_arithmetic"><field name="OP">${arith[n.operator]}</field>${val('A', expr(n.left))}${val('B', expr(n.right))}</block>`;
        if (cmp[n.operator]) return `<block type="logic_compare"><field name="OP">${cmp[n.operator]}</field>${val('A', expr(n.left))}${val('B', expr(n.right))}</block>`;
        throw new Error(`binary ${n.operator}`);
      case 'LogicalExpression':
        return `<block type="logic_operation"><field name="OP">${n.operator === '&&' ? 'AND' : 'OR'}</field>${val('A', expr(n.left))}${val('B', expr(n.right))}</block>`;
      case 'CallExpression':
        return callExpr(n);
      default:
        throw new Error(`expression ${n.type}`);
    }
  }

  function callExpr(n) {
    const a = n.arguments;
    if (n.callee.type === 'MemberExpression' && n.callee.object.name === 'Math') {
      const f = n.callee.property.name;
      if (f === 'abs') return `<block type="math_single"><field name="OP">ABS</field>${val('NUM', expr(a[0]))}</block>`;
      if (f === 'sqrt') return `<block type="math_single"><field name="OP">ROOT</field>${val('NUM', expr(a[0]))}</block>`;
      if (f === 'round') return `<block type="math_round"><field name="OP">ROUND</field>${val('NUM', expr(a[0]))}</block>`;
      throw new Error(`Math.${f}`);
    }
    const name = n.callee.name;
    switch (name) {
      case 'clamp': return `<block type="math_constrain">${val('VALUE', expr(a[0]))}${val('LOW', expr(a[1]))}${val('HIGH', expr(a[2]))}</block>`;
      case 'sinDeg': case 'cosDeg': case 'atanDeg':
        return `<block type="math_trig"><field name="OP">${name.slice(0, -3).toUpperCase()}</field>${val('NUM', expr(a[0]))}</block>`;
      case 'runtime': return '<block type="linearOpMode_getRuntime_Number"/>';
      case 'active': return '<block type="linearOpMode_opModeIsActive"/>';
      case 'yaw': return '<block type="yawPitchRollAngles_getPropertyWithAngleUnit_Number"><field name="PROP">Yaw</field><value name="YAW_PITCH_ROLL_ANGLES"><block type="imu_getProperty_YawPitchRollAngles"><field name="IDENTIFIER">imuAsIMU</field><field name="PROP">RobotYawPitchRollAngles</field></block></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"><field name="ANGLE_UNIT">DEGREES</field></shadow></value></block>';
      case 'leftPos': return `<block type="dcMotor_getProperty_Number">${motorField('left')}</block>`;
      case 'rightPos': return `<block type="dcMotor_getProperty_Number">${motorField('right')}</block>`;
      case 'detections': return `<block type="aprilTagProcessor_getDetections">${val('APRIL_TAG_PROCESSOR', get('myAprilTagProcessor'))}</block>`;
      case 'isCluster': return `<block type="aprilTagDetection2_getProperty_Boolean"><field name="PROP">isClusterDetection</field>${val('APRIL_TAG_DETECTION', expr(a[0]))}</block>`;
      case 'clusterName': return `<block type="aprilTagClusterDetection_getProperty_String"><field name="PROP">metadata.name</field>${val('APRIL_TAG_CLUSTER_DETECTION', expr(a[0]))}</block>`;
      case 'pose': return `<block type="aprilTagDetection2_getProperty_Number"><field name="PROP">${esc(str(a[1]))}</field>${val('APRIL_TAG_DETECTION', expr(a[0]))}</block>`;
      default: {
        const p = procs.get(name);
        if (!p) throw new Error(`unknown function ${name}`);
        if (!p.returns) throw new Error(`${name} has no return value but is used as a value`);
        return procCall('procedures_callreturn', name, p, a);
      }
    }
  }

  function procCall(type, name, p, a) {
    if (a.length !== p.params.length) throw new Error(`${name}: expected ${p.params.length} args`);
    const mut = `<mutation name="${name}">${p.params.map((x) => `<arg name="${x}"/>`).join('')}</mutation>`;
    return `<block type="${type}">${mut}${a.map((x, i) => val(`ARG${i}`, expr(x))).join('')}</block>`;
  }

  const runMode = (m) => `<block type="dcMotor_setDualProperty_RunMode"><field name="PROP">Mode</field><field name="IDENTIFIER1">leftDriveAsDcMotor</field><field name="IDENTIFIER2">rightDriveAsDcMotor</field><data>{"IDENTIFIER1":"leftDrive","IDENTIFIER2":"rightDrive"}</data><value name="VALUE1"><shadow type="dcMotor_typedEnum_runMode"><field name="RUN_MODE">${m}</field></shadow></value><value name="VALUE2"><shadow type="dcMotor_typedEnum_runMode"><field name="RUN_MODE">${m}</field></shadow></value>`;
  const dir = (side, d) => `<block type="dcMotor_setProperty_Direction"><field name="IDENTIFIER">${side}DriveAsDcMotor</field><field name="PROP">Direction</field><data>{"IDENTIFIER":"${side}Drive"}</data><value name="VALUE"><shadow type="dcMotor_typedEnum_direction"><field name="DIRECTION">${d}</field></shadow></value>`;

  /** Returns a list of "open" statement blocks (each without its closing </block>) so they can be chained with <next>. */
  function stmt(n) {
    if (n.type === 'ExpressionStatement') {
      const e = n.expression;
      if (e.type === 'AssignmentExpression') {
        const name = e.left.name;
        let rhs = e.right;
        if (e.operator !== '=') rhs = { type: 'BinaryExpression', operator: e.operator[0], left: e.left, right: e.right };
        return [`<block type="variables_set">${v(name)}${val('VALUE', expr(rhs))}`];
      }
      if (e.type === 'CallExpression') return callStmt(e);
      throw new Error(`statement expression ${e.type}`);
    }
    if (n.type === 'IfStatement') {
      const tests = [];
      const bodies = [];
      let cur = n;
      let elseBody = null;
      while (cur) {
        tests.push(cur.test);
        bodies.push(cur.consequent);
        if (cur.alternate && cur.alternate.type === 'IfStatement') cur = cur.alternate;
        else { elseBody = cur.alternate; cur = null; }
      }
      const mut = tests.length > 1 || elseBody ? `<mutation${tests.length > 1 ? ` elseif="${tests.length - 1}"` : ''}${elseBody ? ' else="1"' : ''}/>` : '';
      let x = `<block type="controls_if">${mut}`;
      tests.forEach((t, i) => { x += val(`IF${i}`, expr(t)) + `<statement name="DO${i}">${chain(block(bodies[i]))}</statement>`; });
      if (elseBody) x += `<statement name="ELSE">${chain(block(elseBody))}</statement>`;
      return [x];
    }
    if (n.type === 'WhileStatement') {
      return [`<block type="controls_whileUntil"><field name="MODE">WHILE</field>${val('BOOL', expr(n.test))}<statement name="DO">${chain(block(n.body))}</statement>`];
    }
    if (n.type === 'ForOfStatement') {
      const name = n.left.declarations[0].id.name;
      return [`<block type="controls_forEach">${v(name)}${val('LIST', expr(n.right))}<statement name="DO">${chain(block(n.body))}</statement>`];
    }
    throw new Error(`statement ${n.type}`);
  }

  function callStmt(e) {
    const a = e.arguments;
    const name = e.callee.name;
    switch (name) {
      case 'comment': return [`<block type="comment"><field name="COMMENT">${esc(str(a[0]))}</field>`];
      case 'drive': return [`<block type="dcMotor_setDualProperty_Number"><field name="PROP">Power</field><field name="IDENTIFIER1">leftDriveAsDcMotor</field><field name="IDENTIFIER2">rightDriveAsDcMotor</field><data>{"IDENTIFIER1":"leftDrive","IDENTIFIER2":"rightDrive"}</data>${val('VALUE1', expr(a[0]))}${val('VALUE2', expr(a[1]))}`];
      case 'resetEncoders': return [runMode('STOP_AND_RESET_ENCODER'), runMode('RUN_USING_ENCODER')];
      case 'initDrive': return [dir('left', 'FORWARD'), dir('right', 'REVERSE'), '<block type="dcMotor_setDualProperty_ZeroPowerBehavior"><field name="PROP">ZeroPowerBehavior</field><field name="IDENTIFIER1">leftDriveAsDcMotor</field><field name="IDENTIFIER2">rightDriveAsDcMotor</field><data>{"IDENTIFIER1":"leftDrive","IDENTIFIER2":"rightDrive"}</data><value name="VALUE1"><shadow type="dcMotor_typedEnum_zeroPowerBehavior"><field name="ZERO_POWER_BEHAVIOR">BRAKE</field></shadow></value><value name="VALUE2"><shadow type="dcMotor_typedEnum_zeroPowerBehavior"><field name="ZERO_POWER_BEHAVIOR">BRAKE</field></shadow></value>'];
      case 'initImu': return ['<block type="imu_initialize"><field name="IDENTIFIER">imuAsIMU</field><value name="PARAMETERS"><block type="imuParameters_create"><value name="IMU_ORIENTATION_ON_ROBOT"><block type="revHubOrientationOnRobot_create1"><value name="LOGO_FACING_DIRECTION"><block type="revHubOrientationOnRobot_typedEnum_logoFacingDirection"><field name="LOGO_FACING_DIRECTION">UP</field></block></value><value name="USB_FACING_DIRECTION"><block type="revHubOrientationOnRobot_typedEnum_usbFacingDirection"><field name="USB_FACING_DIRECTION">RIGHT</field></block></value></block></value></block></value>'];
      case 'resetYaw': return ['<block type="imu_resetYaw"><field name="IDENTIFIER">imuAsIMU</field>'];
      case 'initVision':
        vars.add('myAprilTagProcessor'); vars.add('myVisionPortal'); vars.add('myVisionPortalBuilder');
        return [
          `<block type="variables_set">${v('myAprilTagProcessor')}<value name="VALUE"><block type="aprilTagProcessor_easyCreateWithDefaults"/></value>`,
          '<block type="visionPortalBuilder_create_assign"><field name="VISION_PORTAL_BUILDER" id="v_myVisionPortalBuilder" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field>',
          '<block type="visionPortalBuilder_setCamera"><field name="VISION_PORTAL_BUILDER" id="v_myVisionPortalBuilder" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field><value name="CAMERA"><block type="navigation_switchableCamera_forAllWebcams"/></value>',
          `<block type="visionPortalBuilder_addProcessor"><field name="VISION_PORTAL_BUILDER" id="v_myVisionPortalBuilder" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field>${val('VISION_PROCESSOR', get('myAprilTagProcessor'))}`,
          `<block type="variables_set">${v('myVisionPortal')}<value name="VALUE"><block type="visionPortalBuilder_build"><field name="VISION_PORTAL_BUILDER" id="v_myVisionPortalBuilder" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field></block></value>`,
          `<block type="visionPortal_setActiveCamera">${val('VISION_PORTAL', get('myVisionPortal'))}<value name="WEBCAM_NAME"><shadow type="navigation_webcamName"><field name="WEBCAM_NAME">Webcam 1</field></shadow></value>`,
        ];
      case 'waitForStart': return ['<block type="linearOpMode_waitForStart">'];
      case 'sleep': return [`<block type="linearOpMode_sleep">${val('MILLISECONDS', expr(a[0]))}`];
      case 'setPower': {
        const m = str(a[0]);
        return [`<block type="dcMotor_setProperty_Number"><field name="IDENTIFIER">${m}AsDcMotor</field><field name="PROP">Power</field><data>{"IDENTIFIER":"${m}"}</data>${val('VALUE', expr(a[1]))}`];
      }
      case 'text': return [`<block type="telemetry_addTextData_All">${val('KEY', expr(a[0]))}${val('TEXT', expr(a[1]))}`];
      case 'num': return [`<block type="telemetry_addNumericData_Number">${val('KEY', expr(a[0]))}${val('NUMBER', expr(a[1]))}`];
      case 'update': return ['<block type="telemetry_update">'];
      default: {
        const p = procs.get(name);
        if (!p) throw new Error(`unknown statement call ${name}`);
        const x = procCall('procedures_callnoreturn', name, p, a);
        return [x.slice(0, -'</block>'.length)];
      }
    }
  }

  const block = (n) => (n.type === 'BlockStatement' ? n.body : [n]).flatMap(stmt);
  function chain(open) {
    let out = '';
    for (let i = open.length - 1; i >= 0; i--) out = open[i] + (out ? `<next>${out}</next>` : '') + '</block>';
    return out;
  }
  const countStmts = (xml) => (xml.match(/<block type="(?:variables_set|controls_|dcMotor_set|telemetry_|linearOpMode_sleep|procedures_callnoreturn|comment|imu_|vision)/g) || []).length;

  // Layout: columns, generous spacing so long functions never overlap.
  const blocks = [];
  const COL_W = 1100;
  const colY = [20, 20, 20];
  for (const fn of ast.body) {
    const name = fn.id.name;
    const p = procs.get(name);
    let body = fn.body.body;
    let ret = null;
    if (p.returns) { ret = body[body.length - 1].argument; body = body.slice(0, -1); }
    const stack = chain(body.flatMap(stmt));
    const doc = docs.get(name);
    const col = name === 'runOpMode' ? 0 : colY.indexOf(Math.min(...colY.slice(1))) ;
    const x = 20 + col * COL_W;
    const y = colY[col];
    colY[col] += 160 + countStmts(stack) * 34 + (doc ? 140 : 0);
    const mut = p.params.length ? `<mutation>${p.params.map((a) => `<arg name="${a}" varid="v_${a}"/>`).join('')}</mutation>` : '';
    const cm = doc ? `<comment pinned="false" h="140" w="560">${esc(doc)}</comment>` : '';
    blocks.push(`<block type="${p.returns ? 'procedures_defreturn' : 'procedures_defnoreturn'}"${name === 'runOpMode' ? ' deletable="false"' : ''} x="${x}" y="${y}">${mut}<field name="NAME">${name}</field>${cm}<statement name="STACK">${stack}</statement>${ret ? val('RETURN', expr(ret)) : ''}</block>`);
  }
  const varXml = [...vars].sort().map((n) => `<variable id="v_${n}"${typedVars[n] ? ` type="${typedVars[n]}"` : ''}>${n}</variable>`).join('');
  return `<xml xmlns="https://developers.google.com/blockly/xml"><variables>${varXml}</variables>${blocks.join('')}</xml><?xml version='1.0' encoding='UTF-8' standalone='yes' ?><Extra><OpModeMeta flavor="AUTONOMOUS" group="Sim" autoTransition="" /><Enabled value="true" /></Extra>`;
}

if (process.argv[1] && process.argv[1].endsWith('js2blk.mjs') && process.argv[2]) {
  const out = compile(fs.readFileSync(process.argv[2], 'utf8'));
  fs.writeFileSync(process.argv[3], out);
  console.log(`wrote ${process.argv[3]} (${out.length} bytes)`);
}
