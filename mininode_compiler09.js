// -------------------------
// mininode_compiler.js - Mini Node.js Compiler by Node.js
// - 01: i32 literal
// - 04: binary operator
//   - 01: +
//   - 04: -, *, /, % 
// - 06: compare (===, !==, >, >=, <, <=)
// - 05: multi lines
// - 05: local variable
// - 04: run on mininode interpriter
// - 07: if/else
// - 08: while
// - user define function
// -------------------------

"use strict"

const loadAndParseSrc = require('./module_parser_extra2.js');
const println = require('./module_println.js');
const printObj = require('./module_printobj.js');
const abort = require('./module_abort.js');
//const callBuiltinByName = require('./module_builtin_extra2.js');
const getTypeOf = require('./module_gettypeof.js');
const getLength = require('./module_getlength.js');
const getKeys = require('./module_getkeys.js');

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

let l_ctx = {
  'tempIdx': 0, // temp index
};

let g_ctx = {
  'strIdx' : 0, // string index
  'strList' : {}, // string hash:  ['@s_1'] = ['xxxxx', length]
}

function makeTempLabelName(lctx) {
  let idx = lctx['tempIdx'];
  idx = idx + 1;
  lctx['tempIdx'] = idx;

  const name = 'L' + idx + '_';
  return name;
}

function nextTempName(lctx) {
  let idx = lctx['tempIdx'];
  idx = idx + 1;
  lctx['tempIdx'] = idx;

  // -- set type as i32 (default type) --
  setCurrentTempType(lctx, 'i32');

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

function setCurrentTempType(lctx, t) {
  lctx['tempType'] = t;
}

function currentTempType(lctx) {
  return lctx['tempType'];
}

// -- add global string, return name of string --
function addGlobalString(str, gctx) {
  // -- strings --
  // '@.s_1' : ['xxxxxxx', len],

  // --- name of string
  let idx = gctx['strIdx'];
  const name = '@.s_' + idx;
  idx = idx + 1;
  gctx['strIdx'] = idx;

  const len = getLength(str);
  const cstr = str + '\\00';
  const clen = len + 1;

  const globalString = [cstr, clen];
  let strList = gctx['strList'];
  strList[name] = globalString;

  return name;
}

function getGlobalString(name, gctx) {
  const strList = gctx['strList'];
  return strList[name];
}

// ---- compile simplified tree into LLVM IR ---
function compile(tree, gctx, lctx) {
  const mainBlock = generate(tree, gctx, lctx);
  const mainFunc = generateMain(mainBlock, lctx);
  const builtinFunc = generateBuiltin();
  const globalStrings = generateGlobalString(gctx);
  return mainFunc + globalStrings + builtinFunc;
}

// ---- genereate LLVM IR block ---
function generate(tree, gctx, lctx) {
  if (tree === null) {
    return '';
  }
  
  // --- multi lines ---
  if (tree[0] === 'stmts') {
    let i = 1;
    let block = '';
    while (tree[i]) {
      block = block + generate(tree[i], gctx, lctx) + LF();
      i = i + 1;
    }
    return block;
  }

  // --- debug print ---
  if (tree[0] === 'func_call') {
    if (tree[1] === 'putn') {
      const argBlock = generate(tree[2], gctx, lctx);
      const argTempName = currentTempName(lctx);
      const callBlock = TAB() + 'call void @putn(i32 ' + argTempName + ')' + LF();
      return argBlock + callBlock;
    }

    if (tree[1] === 'puts') {
      const argBlock = generate(tree[2], gctx, lctx);
      const argTempName = currentTempName(lctx);
      const retTempName = nextTempName(lctx);
      const callBlock = TAB() + retTempName + ' = call i32 @puts(i8* ' + argTempName + ')' + LF();
      return argBlock + callBlock;
    }

    println('-- ERROR: unknown func name in generate() ---');
    printObj(tree);
    abort();
  }

  if (tree[0] === 'while') {
    const label = makeTempLabelName(lctx);
    const labelWhile = label + 'WHILE_BEGIN';
    const labelBody = label + 'WHILE_BODY';
    const labelEnd = label + 'WHILE_END';

    // --- begin of while : condition block ---
    let block = TAB() + 'br label %' + labelWhile + ' ; -- jump to begin of while_block:' + label + ' --' + LF();
    block = block + labelWhile + ':' + LF();

    // --- condition ---
    const condition = generate(tree[1], gctx, lctx);
    block = block + condition;

    // -- cast i32 to i1, if needed --
    const castBlock = castToI1(lctx);
    block = block + castBlock;

    const conditionName = currentTempName(lctx);
    block = block + TAB() + 'br i1 ' + conditionName + ', label %' + labelBody + ', label %' + labelEnd + LF();

    // --- while body --
    const blockBody = generate(tree[2], gctx, lctx);
    block = block + labelBody + ':' + LF();
    block = block + blockBody;
    block = block + TAB() + 'br label %' + labelWhile + LF();

    // --- end of while --
    block = block + labelEnd + ':' + ' ; --- end while_block:' + label + ' ---' + LF();

    return block;
  }

  if (tree[0] === 'if') {
    const label = makeTempLabelName(lctx);
    const labelPositive = label + 'POSITIVE';
    const labelNegative = label + 'NEGATIVE';
    const labelEnd = label + 'END';

    // --- condition ---
    const condition = generate(tree[1], gctx, lctx);
    //const conditionName = currentTempName(lctx);
    let block = TAB() + '; --- begin if_block:' + label + ' ---' + LF();
    block = block + condition;

    // -- cast i32 to i1, if needed --
    const castBlock = castToI1(lctx);
    block = block + castBlock;

    const conditionName = currentTempName(lctx);
    block = block + TAB() + 'br i1 ' + conditionName + ', label %' + labelPositive + ', label %' + labelNegative + LF();

    // --- positive ---
    const blockPositive = generate(tree[2], gctx, lctx);
    block = block + labelPositive + ':' + LF();
    block = block + blockPositive;
    block = block + TAB() + 'br label %' + labelEnd + LF();

    // --- negative ---
    block = block + labelNegative + ':' + LF();
    if (tree[3]) {
      const blockNagetive = generate(tree[3], gctx, lctx);
      block = block + blockNagetive;
    }
    block = block + TAB() + 'br label %' + labelEnd + LF();

    // --- end ---
    block = block + labelEnd + ':' + ' ; --- end if_block:' + label + ' ---' + LF();

    return block;
  }
  
  // --- local variable --
  // 'var_name' : [ 'local_var', 'i32', addrVarName ],
  if (tree[0] === 'var_decl') {
    // -- check NOT exist --
    const name = tree[1];
    if (name in lctx) {
      println('---ERROR: varbable ALREADY exist (compiler) --');
      abort();
    }

    let block = '';
    // -- alloc on stack --
    const addrVar = nextTempName(lctx);
    block = block + TAB() + addrVar + ' = alloca i32, align 4' + ' ;alloc localVariable:' + name + LF();
    lctx[name] = ['local_var', 'i32', addrVar];

    // --- assign initial value --
    const init = generate(tree[2], gctx, lctx);
    if (init !== '') {
      block = block + init;

      // -- cast i1 to i32, if needed --
      const castBlock = castToI32(lctx);
      block = block + castBlock;

      const initValue = currentTempName(lctx);
      block = block + TAB() + 'store i32 ' + initValue + ', i32* ' + addrVar + ', align 4' + ' ;store init localVariable:' + name + LF();
    }

    return block;
  }
  if (tree[0] === 'var_assign') {
    // -- check EXIST --
    const name = tree[1];
    if (name in lctx) {
      let block = '';
      const localVar = lctx[name];
      const addrVar = localVar[2];
      const valBlock =  generate(tree[2], gctx, lctx);
      if (valBlock === '') {
        println('---ERROR: var assign value NOT exist --');
        abort();
      }
      block = block + valBlock + LF();

      // -- cast i1 to i32, if needed --
      const castBlock = castToI32(lctx);
      block = block + castBlock;

      const lastValue = currentTempName(lctx);
      block = block + TAB() + 'store i32 ' + lastValue + ', i32* ' + addrVar + ', align 4' + ' ;store localVariable:' + name + LF();
      
      return block;
    }

    println('---ERROR: varibable NOT declarated (assign)--:' + name);
    abort();
  }
  if (tree[0] === 'var_ref') {
    // -- check EXIST --
    const name = tree[1];
    if (name in lctx) {
      let block = '';
      const localVar = lctx[name];
      const addrVar = localVar[2];
      const val = nextTempName(lctx);

      // %t1 = load i32, i32* %v1, align 4
      block = TAB() + val + ' = load i32, i32* ' + addrVar + ', align 4' + ' ;load localVariable:' + name + LF();
      return block;
    }

    println('---ERROR: varibable NOT declarated (ref)--:' + name);
    abort();
  }

  if (tree[0] === 'lit') {
    const t = getTypeOf(tree[1]); // move typeof to module
    if (t === 'number') {
      // --- int32 literal ---
      const tempName = nextTempName(lctx);
      return TAB() + tempName + ' = or i32 ' + tree[1] + ', 0' + LF();
    }

    if (t === 'string') {
      // --- string literal ---
      const name = addGlobalString(tree[1], gctx);
      const gstr = getGlobalString(name, gctx); // ['xxxxxx', length]
      const tempName = nextTempName(lctx);
      setCurrentTempType(lctx, 'i8*');
      const block = TAB() + tempName + ' = getelementptr inbounds [' + gstr[1] +  ' x i8], [' + gstr[1] + ' x i8]* ' + name + ', i32 0, i32 0' + LF();
      return block;
    }

    println('---ERROR: unknwon type of literal--:' + t);
    abort();
  }

  // --- binary operator ---
  if (tree[0] === '+') {
    return generateBinaryOperator(tree, 'add', gctx, lctx);
  }
  if (tree[0] === '-') {
    return generateBinaryOperator(tree, 'sub', gctx, lctx);
  }
  if (tree[0] === '*') {
    return generateBinaryOperator(tree, 'mul', gctx, lctx);
  }
  if (tree[0] === '/') {
    return generateBinaryOperator(tree, 'sdiv', gctx, lctx);
  }
  if (tree[0] === '%') {
    return generateBinaryOperator(tree, 'srem', gctx, lctx);
  }

  // --- compare operator ---
  if (tree[0] === '===') {
    const block = generateCompareOperator(tree, 'icmp eq', gctx, lctx);
    return block;
  }
  if (tree[0] === '!==') {
    const block = generateCompareOperator(tree, 'icmp ne', gctx, lctx);
    return block;
  }
  if (tree[0] === '<') {
    const block = generateCompareOperator(tree, 'icmp slt', gctx, lctx);
    return block;
  }
  if (tree[0] === '<=') {
    const block = generateCompareOperator(tree, 'icmp sle', gctx, lctx);
    return block;
  }
  if (tree[0] === '>') {
    const block = generateCompareOperator(tree, 'icmp sgt', gctx, lctx);
    return block;
  }
  if (tree[0] === '>=') {
    const block = generateCompareOperator(tree, 'icmp sge', gctx, lctx);
    return block;
  }

  println('-- ERROR: unknown node in generate() ---');
  printObj(tree);
  abort();
}

// --- cast ---
// cast i1 to i32, if necessary 
function castToI32(lctx) {
  const currentType = currentTempType(lctx);
  if (currentType === 'i32') {
    return '';
  }

  if (currentType === 'i1') {
    const currentName = currentTempName(lctx);
    const castedName = nextTempName(lctx);
    const castBlock = TAB() + castedName + ' = zext i1 ' + currentName + ' to i32 ;cast i1 to i32' + LF();
    return castBlock;  
  }

  /*
  if (currentType === 'i8*') {
    const castedName = nextTempName(lctx);
    const castBlock = TAB() + castedName + ' = or i32 255, 255 ;-- dummy value for casting i8* to i32 --' + LF();
    return castBlock;
  }
  */

  println('-- ERROR: unknown type in castToI32() ---');
  printObj(currentType);
  abort();
}

// cast i32 to i1, if necessary
function castToI1(lctx) {
  if (currentTempType(lctx) === 'i1') {
    return '';
  }

  const currentName = currentTempName(lctx);
  const castedName = nextTempName(lctx);
  const castBlock = TAB() + castedName + ' = icmp ne i32 ' + currentName + ', 0' + LF();
  return castBlock;
}



// --- binary operator ---
function generateBinaryOperator(tree, operator, gctx, lctx) {
  const leftBlock = generate(tree[1], gctx, lctx);
  const leftTempName = currentTempName(lctx);
  const rightBlock = generate(tree[2], gctx, lctx);
  const rightTempName = currentTempName(lctx);

  const tempName = nextTempName(lctx);
  const operatorBlock = TAB() + tempName + ' = ' + operator + ' i32 ' + leftTempName + ', ' + rightTempName + LF();
  return (leftBlock + rightBlock + operatorBlock);
}

// --- compare operator ---
function generateCompareOperator(tree, operator, gctx, lctx) {
  const block = generateBinaryOperator(tree, operator, gctx, lctx);
  setCurrentTempType(lctx, 'i1');
  return block;
}

function generateMain(mainBlock, lctx) {
  let block = '';
  block = block + 'define i32 @main() {' + LF();
  block = block + mainBlock;

  // -- cast i1 to i32, if needed --
  const castBlock = castToI32(lctx);
  block = block + castBlock;

  const lastTempName = currentTempName(lctx);
  block = block + TAB() + 'ret i32 ' + lastTempName + LF();
  block = block + '}' + LF();
  return block;
}

function generateBuiltin() {
  let block = LF();
  block = block + '; --- builtin functions ---' + LF();
  block = block + '@.sputn = private unnamed_addr constant [5 x i8] c"%d\\0D\\0A\\00", align 1' + LF();
  block = block + 'declare i32 @printf(i8*, ...)' + LF();
  block = block + 'declare i32 @puts(i8*)' + LF();
  block = block + LF();
  block = block + 'define void @putn(i32) {' + LF();
  block = block + '  %r1 = call i32 (i8*, ...) @printf(i8* getelementptr inbounds ([5 x i8], [5 x i8]* @.sputn, i32 0, i32 0), i32 %0)' + LF();
  block = block + '  ret void' + LF();
  block = block + '}' + LF();
  return block;
}

function generateGlobalString(gctx) {
  let block = LF();
  block = block + '; --- global strings ---' + LF();

  const strList = gctx['strList'];  
  const keys = getKeys(strList);
  const len = getLength(keys);
  let key;
  let i = 0;
  let gstr;
  while (i < len) {
    key = keys[i];
    gstr = strList[key]; // ['xxxxxxx', length]
    block = block + key + ' = private constant [' + gstr[1] + ' x i8] c"' + gstr[0] + '", align 1' + LF();
    i = i + 1;
  }

  return block;
}


// ======== start compiler =======

// --- load and parse source ---
const tree = loadAndParseSrc();
println('--- tree ---');
printObj(tree);

// --- compile ----
const ll = compile(tree, g_ctx, l_ctx);
println('--- result ---');
println(ll);
writeFile('generated.ll', ll);

