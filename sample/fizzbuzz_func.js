
function fizzbuzz(n) {
  if (n % (3*5) === 0) {
    puts('FizzBuzz');
    return 15;
  }
  else if (n % 3 === 0) {
    puts('Fizz');
    return 3;
  }
  else if (n % 5 === 0) {
    puts('Buzz');
    return 5;
  }
  else {
    putn(n);
    return n;
  }
}

let i = 1;
let ret;
while (i <= 100) {
  ret = fizzbuzz(i)
  i = i + 1;
}

//0;
