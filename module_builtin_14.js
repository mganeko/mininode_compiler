// -------------------------
// module_builtin.js - Node.js by Node.js builtin
// Step14:
// - double
// -------------------------

'use strict'

const loadAndParseSrc = require('./module_parser_13.js');
const println = require('./module_println.js');
const printObj = require('./module_printobj.js');
const abort = require('./module_abort.js');

// --- for compiler ---
const writeFile = require('./module_writefile.js');
const getTypeOf = require('./module_gettypeof.js');
const getLength = require('./module_getlength.js');
const getKeys = require('./module_getkeys.js');
const printWarn = require('./module_printwarn.js');

// --- for console.log ---
//const consoleLog = console.log;
const consoleLog = require('./module_consolelog.js');

// --- for double ---
const isDouble = require('./module_isdouble.js');
const putf = require('./module_putf.js');


// === exports ===
module.exports = callBuiltinByName;

function callBuiltinByName(name, args) {
  //const func = eval(name); // OK
  const func = builtins[name]; // OK

  return func.apply({}, args); // 1st:this, 2nd:args
}

let builtins = {
  'require' : require,
  'println' : println,
  'printObj' : printObj,
  'abort' : abort,
  'callBuiltinByName' : callBuiltinByName,
  'loadAndParseSrc' : loadAndParseSrc,

  // --- for compiler ---
  'writeFile' : writeFile, 
  //'putn': println,
  //'puts' : println,
  'getTypeOf' : getTypeOf, 
  'getLength' : getLength,
  'getKeys' : getKeys,
  'printWarn' : printWarn,

  // --- for console.log ---
  'consoleLog' : consoleLog,

  // --- for double ---
  'isDouble' : isDouble,
  'putf' : putf,
};
