// -------------------------
// mininode_compiler.js - Mini Node.js Compiler by Node.js
// - 03: i32 literal
// - binary operator
//   - 03: +
//   - -, *, /, % 
// -------------------------

const loadAndParseSrc = require('./module_parser_extra2.js');
const println = require('./module_println.js');
const printObj = require('./module_printobj.js');
const abort = require('./module_abort.js');
//const callBuiltinByName = require('./module_builtin_extra2.js');

// --- for compiler ---
const fs = require('fs');
function writeFile(filename, str) {
  fs.writeFileSync(filename, str);
  return null;
}

// ======== for comiler =======
const LF = '\n';
const TAB = '  ';

let lctx = {
  'tempIdx': 0, // temp index
};

// ---- compile simplified tree into LLVM IR ---
function compile(tree, lctx) {
  let mainBlock = generate(tree, lctx);
  let mainFunc = generateMain(mainBlock, lctx);
  return mainFunc;
}

// ---- genereate LLVM IR block ---
function generate(tree, lctx) {
  // --- int32 literal ---
  if (tree[0] === 'lit') {
    let idx = lctx['tempIdx'];
    idx = idx + 1;
    lctx['tempIdx'] = idx;
    let tempName = '%t' + idx;
    return TAB + tempName + ' = or i32 ' + tree[1] + ', 0' + LF;
  }

  // --- binary operator ---
  if (tree[0] === '+') {
    const leftBlock = generate(tree[1], lctx);
    const leftTempName = '%t' + lctx['tempIdx']
    const rightBlock = generate(tree[2], lctx);
    const rightTempName = '%t' + lctx['tempIdx']

    //　prepare temp register
    let idx = lctx['tempIdx'];
    idx = idx + 1;
    lctx['tempIdx'] = idx;
    let tempName = '%t' + idx;

    const addBlock = TAB + tempName + ' = add i32 ' + leftTempName + ', ' + rightTempName + LF;
    return (leftBlock + rightBlock + addBlock);
  }


  println('-- ERROR: unknown node in generate() ---');
  printObj(tree);
  abort();
}

function generateMain(mainBlock, lctx) {
  let lastTempName = '%t' + lctx['tempIdx']

  let block = '';
  block = block + 'define i32 @main() {' + LF;

  //block = block + TAB + 'ret i32 ' + mainBlock + LF;
  block = block + mainBlock;
  block = block + TAB + 'ret i32 ' + lastTempName + LF;

  block = block + '}' + LF;
  return block;
}

// ======== start compiler =======

// --- load and parse source ---
const tree = loadAndParseSrc();
//println('--- tree ---');
//printObj(tree);

// --- compile ----
const ll = compile(tree, lctx);
//println('--- result ---');
//println(ll);
writeFile('generated.ll', ll);

