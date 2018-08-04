// -------------------------
// mininode_compiler.js - Mini Node.js Compiler by Node.js
// - 01: i32 literal
// - 04: binary operator
//   - 01: +
//   - 04: -, *, /, % 
// - 06: compare (===, !==, >, >=, <, <=)
// - 05: multi lines
// - 05: local variable
//   - CAN NOT USE 'tempIdx'/'tempType' as local variable (reserved)
// - 04: run on mininode interpriter
// - 07: if/else
// - 08: while
// - 09: puts(), grobal string
// - 10: user defined function
//   - 10: multi args
//   - 10: ret
//   - 10: call user defined / builtin
//   - 11: dummy ret code?
//   - 10: generate function code
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
  '_tempIdx': 0, // temp index
  '_tempType': 'i32', // current temp type
};

let g_ctx = {
  'strIdx' : 0, // string index
  'strList' : {}, // string hash:  strList['@s_1'] = ['xxxxx', length]
  'funcList' : {},  // function hash: funcList['func1'] = [func_type, func_symbol, ret_type, args_count, func_body]
                    //  ex) funcList['add'] = ['user_defined', '@add', 'i32', 2, '.....']
};

function setupBuiltinFunc(gctx) {
  let funcList = gctx['funcList'];
  funcList['putn'] = ['builtin_func', '@putn', 'void', 1]; // no func_body for builtin
  funcList['puts'] = ['builtin_func', '@puts', 'i32', 1]; // no func_body for builtin
}

function makeTempLabelName(lctx) {
  let idx = lctx['_tempIdx'];
  idx = idx + 1;
  lctx['_tempIdx'] = idx;

  const name = 'L' + idx + '_';
  return name;
}

function nextTempName(lctx) {
  let idx = lctx['_tempIdx'];
  idx = idx + 1;
  lctx['_tempIdx'] = idx;

  // -- set type as i32 (default type) --
  setCurrentTempType(lctx, 'i32');

  const name = _makeTempName(idx);
  return name;
}

function currentTempName(lctx) {
  const idx = lctx['_tempIdx'];
  const name = _makeTempName(idx);
  return name;
}

function _makeTempName(idx) {
  return '%t' + idx;
}

function setCurrentTempType(lctx, t) {
  lctx['_tempType'] = t;
}

function currentTempType(lctx) {
  return lctx['_tempType'];
}

function addLocalVariable(lctx, name, type, addr) {
  // 'name' : [ 'local_var', 'i32', addr ]
  const v = ['local_var', type, addr];
  lctx[name] = v;
}

function getLocalVariable(lctx, name) {
  const v = lctx[name];
  return v;
}

function getLocalVariableAddr(lctx, name) {
  const v = getLocalVariable(lctx, name)
  return v[2];
}

//ex) funcList['add'] = ['user_defined', '@add', 'i32', 2, '.....']
function addGlobalFunc(gctx, name, symbol, type, argCount, funcBlock) {
  let funcList = gctx['funcList'];
  funcList[name] = ['user_defined', symbol, type, argCount, funcBlock];
}

function getGlobalFunc(gctx, name) {
  const funcList = gctx['funcList'];
  return funcList[name];
}

function getGlobalFunctionNames(gctx) {
  const funcList = gctx['funcList'];
  const names = getKeys(funcList);
  return names;
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
  const grobalFunctions = generateGlobalFunctions(gctx);
  const globalStrings = generateGlobalString(gctx);
  return mainFunc + grobalFunctions + globalStrings + builtinFunc;
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

  // --- func_def user_defined function ---
  if (tree[0] === 'func_def') {
    // -- append to global context --
    // function hash: funcList['func1'] = [func_type, func_symbol, ret_type, args_count, func_block]
    //  ex) funcList['add'] = ['user_defined', '@add', 'i32', 2, '...']

    const funcName = tree[1];
    const argCount = getLength(tree[2]);
    const funcSymbol = '@' + funcName;
    const funcType = 'i32';
    const argListBlock = generateArgListBlock(argCount);

    // --- prepare new local context for inside of function --
    let newLctx = {
      '_tempIdx': 0, // temp index
      '_tempType': 'i32', // current temp type
    };
    // -- load args to local variable --
    const loadArgBlock = generateLoadArgBlock(tree, argCount, newLctx);

    const funcStart = 'define i32 ' + funcSymbol + '(' + argListBlock + ') {' + LF();
    const funcEnd = '}' + LF();

    // -- add temporary with empty body ---
    addGlobalFunc(gctx, funcName, funcSymbol, funcType, argCount, '');

    // ==== function body =====
    const funcBody = generate(tree[3], gctx, newLctx);

    // --- dummy ret for when func is not end with 'ret', such as if/else or while block --
    const dummyRet = generateDummyRet(newLctx);

    // ==== whole func definition ===
    const funcBlock = funcStart + loadArgBlock + funcBody + dummyRet + funcEnd;
    addGlobalFunc(gctx, funcName, funcSymbol, funcType, argCount, funcBlock);

    // --- no codes in this timing --
    const empty = '';
    return empty;
  }

  // --- return from function ---
  if (tree[0] === 'ret') {
    let block = '';
    const valueBlock = generate(tree[1], gctx, lctx);

    /*
    // -- return without value ---
    if (valueBlock === '') {
      block = block + TAB() + 'ret void' + LF();
      return block;
    }
    */

    // ----- return with value ----
    block = block + valueBlock;

    // -- cast i1 to i32, if needed --
    const castBlock = castToI32(lctx);
    block = block + castBlock;

    const retName = currentTempName(lctx);
    block = block + TAB() + 'ret i32 ' + retName + LF();
    return block;
  }
 
  if (tree[0] === 'func_call') {  // tree = ['func_call', 'name', arg1, arg2, ... ]
    const func = getGlobalFunc(gctx, tree[1]);
      // func : ['user_defined', '@add', 'i32', 2, '.....']
    let block = '';
    
    if (func) {
      // --- args ---
      let arg = '';
      let argBlock = '';
      let argList = '';
      let i = 0;
      while (tree[2 + i]) {
        argBlock = argBlock + generate(tree[2 + i], gctx, lctx);
        arg = currentTempType(lctx) + ' ' + currentTempName(lctx);
        if (i > 0) {
          argList = argList + ', ';
        }
        argList = argList + arg;
    
        i = i + 1;
      }
      if (i !== func[3]) {
        println('-- WARN: arg count NOT same :' + func[1]);
      }

      // --- call ---
      const funcSymbol = func[1];
      const funcType = func[2];
      block = block + TAB() + ';--- calling func: ' + funcSymbol + '()' + LF();
      block = block + argBlock;
      if (funcType === 'void') {
        block = block + TAB() + 'call void ' + funcSymbol + '(' + argList + ')' + LF();
        return block;
      }
      else if (funcType === 'i32') {
        const retName = nextTempName(lctx);
        block = block + TAB() + retName + ' = call i32 ' + funcSymbol + '(' + argList + ')' + LF();
        return block;
      }
      else {
        println('--- ERROR, unknown func ret type:' + funcType);
        abort();
      }
    }

    println('-- ERROR: unknown func name in generate() --');
    printObj(tree);
    abort();
  }

  // --- debug print ---
  /*
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
  */

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
    setCurrentTempType(lctx, 'void');

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
    setCurrentTempType(lctx, 'void');

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
    //lctx[name] = ['local_var', 'i32', addrVar];
    addLocalVariable(lctx, name, 'i32', addrVar);

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
      //const localVar = lctx[name];
      //const addrVar = localVar[2];
      const addrVar = getLocalVariableAddr(lctx, name);
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
      //const localVar = lctx[name];
      //const addrVar = localVar[2];
      const addrVar = getLocalVariableAddr(lctx, name);
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

// -- arg list for user define function ---- 
function generateArgListBlock(argCount) {
  let argList = '';
  let i = 0;
  while (i < argCount) {
    if (i === 0) {
      argList = argList + 'i32';
    }
    else {
      argList = argList + ', i32';
    }

    i = i + 1;
  }

  return argList;
}

// --- loading args for user define function ----
function generateLoadArgBlock(tree, argCount, lctx) {
  const args = tree[2];
  let argName = '';
  let addrVar = null;

  let argLoadBlock = '';
  let i = 0;
  let argIdx;
  while (i < argCount) {
    // -- alloc on stack --
    argIdx = '%' + i;
    argName = args[i];
    addrVar = nextTempName(lctx);
    addLocalVariable(lctx, argName, 'i32', addrVar);

    argLoadBlock = argLoadBlock + TAB() + addrVar + ' = alloca i32, align 4' + ' ;alloc arg Variable:' + argName + LF();
    argLoadBlock = argLoadBlock + TAB() + 'store i32 ' + argIdx + ', i32* ' + addrVar + ', align 4' + ' ;store arg Variable:' + argName + LF();
    //setLastVarType(newLctx, 'i32*');

    i = i + 1;
  }

  return argLoadBlock;
}

// --- generate dummy ret, if necessary ---
function generateDummyRet(lctx) {
  const currentType = currentTempType(lctx);
  if (currentType === 'void') {
    // --- dummy ret for when func is not end with 'ret', such as if/else or while block --
    const dummyRet = TAB() + 'ret i32 9999 ;  dummy ret for when returning from if/while block' + LF();
    return dummyRet;
  }

  // --- dummy ret not needed ---
  return '';
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

  if (currentType === 'void') {
    const castedName = nextTempName(lctx);
    const castBlock = TAB() + castedName + ' = or i32 254, 254 ;-- dummy value for casting void to i32 --' + LF();
    return castBlock;
  }

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
  const strings = getKeys(strList);
  const len = getLength(strings);
  let key;
  let i = 0;
  let gstr;
  while (i < len) {
    key = strings[i];
    gstr = strList[key]; // ['xxxxxxx', length]
    block = block + key + ' = private constant [' + gstr[1] + ' x i8] c"' + gstr[0] + '", align 1' + LF();
    i = i + 1;
  }

  return block;
}

function generateGlobalFunctions(gctx) {
  let block = LF();
  block = block + '; --- user_defined functions ---' + LF();

  const names = getGlobalFunctionNames(gctx);
  const len = getLength(names);
  let key;
  let i = 0;
  let gfunc;
  while (i < len) {
    key = names[i];
    gfunc = getGlobalFunc(gctx, key);
      // grunc : ['user_defined', symbol, type, argCount, funcBlock];
    if (gfunc[0] === 'user_defined') {
      block = block + gfunc[4] + LF();
    }

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
setupBuiltinFunc(g_ctx);
const ll = compile(tree, g_ctx, l_ctx);
println('--- result ---');
println(ll);
writeFile('generated.ll', ll);

