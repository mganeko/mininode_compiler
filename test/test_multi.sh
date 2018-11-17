#!/bin/sh
#
# usage:
#  sh multi_test.sh
#


# ----- test target ----
compiler=mininode_compiler12.js
#interpreter=mininode_extra_5.js


# --- summary ---
case_count=0
ok_count=0
err_count=0
last_case_exit=0


TestSingleWithPreprocess() {
  # --- exec 1 test case --
  compiler=$1
  jsfile=$2
  preproc=$3
  check_exit=$4
  cleanup=$5


  # usage:
  #  test_direct_compiler.sh compilername filename preprocess(=[none|exitcode|builtin]) checkexit(=[compareexit|ignoreexit|number]) cleanup(=[remove|save])
  #
  sh test_direct_compiler.sh $compiler $jsfile $preproc $check_exit $cleanup
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

TestSingleWithPreprocess $compiler one.js exitcode compareexit remove
TestSingleWithPreprocess $compiler add.js exitcode compareexit remove
TestSingleWithPreprocess $compiler add_many.js exitcode compareexit remove
TestSingleWithPreprocess $compiler binoperator.js exitcode compareexit remove

TestSingleWithPreprocess $compiler add_var.js builtin ignoreexit remove
TestSingleWithPreprocess $compiler equal.js builtin ignoreexit remove
TestSingleWithPreprocess $compiler equal2.js builtin ignoreexit remove

TestSingleWithPreprocess $compiler if.js builtin compareexit remove
TestSingleWithPreprocess $compiler if_else.js builtin ignoreexit remove
TestSingleWithPreprocess $compiler if32.js builtin compareexit remove
TestSingleWithPreprocess $compiler while.js builtin 0 remove

TestSingleWithPreprocess $compiler puts.js builtin ignoreexit remove
TestSingleWithPreprocess $compiler fizzbuzz_loop.js builtin ignoreexit remove

TestSingleWithPreprocess $compiler func_add.js builtin ignoreexit remove
TestSingleWithPreprocess $compiler fizzbuzz_func.js builtin ignoreexit remove
TestSingleWithPreprocess $compiler fib_func.js builtin ignoreexit remove

# --- report --
Report


# --- exit ----
exit $err_count
