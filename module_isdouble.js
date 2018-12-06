// -------------------------
// module_isdouble.js - Node.js by Node.js
// - isDouble
// -------------------------

'use strict'

// === exports ===
module.exports = isDouble;

function isDouble(num) {
  if (! Number.isInteger(num)) {
    return true;  // 1.234
  }

  // --- 1 or  1.0 ---
  let s = String(num);
  if (s.indexOf('.') !== -1) {
    // -- '.' included, so double
    return true;
  }
  else {
    return false;
  }
}
 



