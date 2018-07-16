// -------------------------
// mininode_compiler.js - Mini Node.js Compiler by Node.js
// - 01: i32 literal
// - binary operator
//   - 01: +
//   - 04: -, *, /, % 
// - run on mininode interpriter
// -------------------------

"use strict"

const loadAndParseSrc = require('./module_parser_extra2.js');
const println = require('./module_println.js');
const printObj = require('./module_printobj.js');
const abort = require('./module_abort.js');
//const callBuiltinByName = require('./module_builtin_extra2.js');

// --- for compiler ---
/*
const fs = require('fs');
function writeFile(filename, str) {
  fs.writeFileSync(filename, str);
  return null;
}
*/

const writeFile = require('./module_writefile.js');

// ======== for comiler =======
//const LF = '\n';
//const TAB = '  ';

function LF() {
  return '\n';
}

function TAB() {
  return '  ';
}

let lctx = {
  'tempIdx': 0, // temp index
};

function nextTempName(lctx) {
  let idx = lctx['tempIdx'];
  idx = idx + 1;
  lctx['tempIdx'] = idx;

  const name = _makeTempName(idx);
  return name;
}

function currentTempName(lctx) {
  const idx = lctx['tempIdx'];
  const name = _makeTempName(idx);
  return name;
}

function _makeTempName(idx) {
  return '%t' + idx;
}

// ---- compile simplified tree into LLVM IR ---
function compile(tree, lctx) {
  const mainBlock = generate(tree, lctx);
  const mainFunc = generateMain(mainBlock, lctx);
  return mainFunc;
}

// ---- genereate LLVM IR block ---
function generate(tree, lctx) {
  // --- int32 literal ---
  if (tree[0] === 'lit') {
    let tempName = nextTempName(lctx);
    return TAB() + tempName + ' = or i32 ' + tree[1] + ', 0' + LF();
  }

  // --- binary operator ---
  if (tree[0] === '+') {
    return generateBinaryOperator(tree, 'add', lctx);
  }
  if (tree[0] === '-') {
    return generateBinaryOperator(tree, 'sub', lctx);
  }
  if (tree[0] === '*') {
    return generateBinaryOperator(tree, 'mul', lctx);
  }
  if (tree[0] === '/') {
    return generateBinaryOperator(tree, 'sdiv', lctx);
  }
  if (tree[0] === '%') {
    return generateBinaryOperator(tree, 'srem', lctx);
  }

  println('-- ERROR: unknown node in generate() ---');
  printObj(tree);
  abort();
}

function generateBinaryOperator(tree, operator, lctx) {
  const leftBlock = generate(tree[1], lctx);
  const leftTempName = currentTempName(lctx);
  const rightBlock = generate(tree[2], lctx);
  const rightTempName = currentTempName(lctx);

  const tempName = nextTempName(lctx);
  const operatorBlock = TAB() + tempName + ' = ' + operator + ' i32 ' + leftTempName + ', ' + rightTempName + LF();
  return (leftBlock + rightBlock + operatorBlock);
}

function generateMain(mainBlock, lctx) {
  //let lastTempName = '%t' + lctx['tempIdx']
  const lastTempName = currentTempName(lctx);

  let block = '';
  block = block + 'define i32 @main() {' + LF();

  block = block + mainBlock;
  block = block + TAB() + 'ret i32 ' + lastTempName + LF();

  block = block + '}' + LF();
  return block;
}

// ======== start compiler =======

// --- load and parse source ---
const tree = loadAndParseSrc();
//println('--- tree ---');
//printObj(tree);

// --- compile ----
const ll = compile(tree, lctx);
println('--- result ---');
println(ll);
writeFile('generated.ll', ll);

