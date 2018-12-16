// ----- builtin helper for putn(), puts() ---
function putn(n) {
  if (n === true) {
    console.log(1);
  }
  else if (n === false) {
    console.log(0);
  }
  else {
    console.log(n);
  }
}

function puts(s) {
  console.log(s);
  return 0;
}

// --- for double --
function putf(d) {
  console.log(d.toFixed(8));
  return 0;
}
// --------------

