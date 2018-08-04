// -------------------------
// module_println.js - Node.js by Node.js builtin
// Step10-module:
// - callBuiltinByName
// -------------------------

'use strict'

const loadAndParseSrc = require('./module_parser_extra2.js');
const println = require('./module_println.js');
const printObj = require('./module_printobj.js');
const abort = require('./module_abort.js');

// --- for compiler ---
const writeFile = require('./module_writefile.js');
const getTypeOf = require('./module_gettypeof.js');
const getLength = require('./module_getlength.js');
const getKeys = require('./module_getkeys.js');

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
};
