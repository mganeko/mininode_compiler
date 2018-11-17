#!/bin/sh
#
# usage:
#  sh multi_test_whole.sh
#


# ----- test target ----
compiler=mininode_compiler12.js
interpreter=mininode_extra_5.js


# --- summary ---
case_count=0
ok_count=0
err_count=0
last_case_exit=0


TestSingleWithPreprocess() {
  # --- exec 1 test case --
  compiler=$1
  interpreter=$2
  jsfile=$3
  preproc=$4
  check_exit=$5
  cleanup=$6


  # usage:
  #  test_direct_compile_interpreter.sh compilername interpreter filename preprocess(=[none|exitcode|builtin]) checkexit(=[compareexit|ignoreexit|number]) cleanup(=[remove|save])
  #
  sh test_direct_compile_interpreter.sh $compiler $interpreter $jsfile $preproc $check_exit $cleanup
  last_case_exit=$?

  # --- check test result--
  case_count=$(($case_count+1))
  if [ "$last_case_exit" -eq 0 ]
  then
    # -- test OK --
    ok_count=$(($ok_count+1))
  else
    # -- test NG --
    err_count=$(($err_count+1))
  fi
}


Report() {
  echo "===== test finish ======"
  echo " total=$case_count"
  echo " OK=$ok_count"
  echo " NG=$err_count"
  echo "======================"
}

# --- force quit  --
#Report
#exit $err_count

# -- param: compilername filename preprocess(=[none|exitcode|builtin]) checkexit(=[compareexit|ignoreexit|number]) cleanup(=[remove|save])

TestSingleWithPreprocess $compiler $interpreter one.js exitcode compareexit remove
TestSingleWithPreprocess $compiler $interpreter add.js exitcode compareexit remove
TestSingleWithPreprocess $compiler $interpreter add_many.js exitcode compareexit remove
TestSingleWithPreprocess $compiler $interpreter binoperator.js exitcode compareexit remove

TestSingleWithPreprocess $compiler $interpreter add_var.js builtin ignoreexit remove
TestSingleWithPreprocess $compiler $interpreter equal.js builtin ignoreexit remove
TestSingleWithPreprocess $compiler $interpreter equal2.js builtin ignoreexit remove

TestSingleWithPreprocess $compiler $interpreter if.js builtin compareexit remove
TestSingleWithPreprocess $compiler $interpreter if_else.js builtin ignoreexit remove
TestSingleWithPreprocess $compiler $interpreter if32.js builtin compareexit remove
TestSingleWithPreprocess $compiler $interpreter while.js builtin 0 remove

TestSingleWithPreprocess $compiler $interpreter puts.js builtin ignoreexit remove
TestSingleWithPreprocess $compiler $interpreter fizzbuzz_loop.js builtin ignoreexit remove

TestSingleWithPreprocess $compiler $interpreter func_add.js builtin ignoreexit remove
TestSingleWithPreprocess $compiler $interpreter fizzbuzz_func.js builtin ignoreexit remove
TestSingleWithPreprocess $compiler $interpreter fib_func.js builtin ignoreexit remove

# --- report --
Report


# --- exit ----
exit $err_count
