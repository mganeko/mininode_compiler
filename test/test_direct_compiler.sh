#!/bin/sh
#
# usage:
#  sh test_direct_compiler.sh compilername filename preprocess(=[none|exitcode|builtin]) checkexit(=[compareexit|ignoreexit|number]) cleanup(=[remove|save]) 
#

compiler=../$1
src=$2
jsfile=../sample/$src
diff_lli=tmp/diff_lli_$src.txt
diff_bin=tmp/diff_bin_$src.txt
exitcode_file=tmp/exitcode_$src.txt
preprocess=$3
check_exit=$4
cleanup=$5


# --- for dilect --
helper_file=builtin_helper.js
direct_file=tmp/node_direct_$src
direct_result=tmp/node_$src.stdout.txt
direct_exit=0

# --- for compile --
lli=lli
if [ $LLI_FOR_TEST ]
then
  lli=$LLI_FOR_TEST
fi

ir_file=tmp/$src.ll
lli_result=tmp/lli_$src.stdout.txt
lli_exit=0

# --- for executable ---
llc=llc
if [ $LLC_FOR_TEST ]
then
  llc=$LLC_FOR_TEST
fi

# llc generated.ll -O0 -march=x86-64 -filetype=obj -o=generated.o
obj_file=tmp/$src.o
llcopt="-O0 -march=x86-64 -filetype=obj"

# ld -arch x86_64 -macosx_version_min 10.12.0 generated.o -lSystem -o fib_func
linker=ld
bin_file=tmp/$src.binary
linkopt="-arch x86_64 -macosx_version_min 10.13.0 -lSystem"

bin_result=tmp/bin_$src.stdout.txt
bin_exit=0


#--- test func ---
TestDirectWithHelper() {
  # --- make test js ---
  #echo "-- prepare direct test file: $direct_file ,   from $jsfile --"
  #cat $helper_file > $direct_file # putn(), puts()
  #cat $jsfile >>  $direct_file
  PreprocessForDirect

  # --- exec ---
  node $direct_file > $direct_result
  direct_exit=$?
  echo "direct exit code=$direct_exit"
}

# --- make test js ---
PreprocessForDirect() {
  if [ "$preprocess" = "exitcode" ]
  then
    echo "-- preprocess for exit code:  src=$jsfile tmp=$direct_file --"
    echo "process.exit(" > $direct_file
    cat $jsfile | sed -e "s/;\$//" >>  $direct_file  #  remove ';' at line end
    echo ");" >> $direct_file
  elif [ "$preprocess" = "builtin" ]
  then
    echo "-- preprocess for builtin func:  src=$jsfile tmp=$direct_file --"
    cat $helper_file > $direct_file # putn(), puts()
    cat $jsfile >>  $direct_file
  else
    echo "-- no preprocess: copy src=$jsfile tmp=$direct_file --"
    cat $jsfile >  $direct_file
  fi
}

TestCompile() {
  # -- force failer --
  #jsfile=../example/add.js

  # --- compile ---
  echo "--- compile src=$jsfile ir=$ir_file compiler=$compiler ---"
  node $compiler $jsfile
  if [ "$?" -eq "0" ]
  then
    echo "compile SUCCERSS"
    mv generated.ll $ir_file
  else
    echo "!! compile FAILED !!"
    exit 1
  fi

  # --- exec ---
  echo "-- exec ir=$ir_file --"
  $lli $ir_file > $lli_result
  lli_exit=$?
  echo "lli exit code=$lli_exit"
}

TestExecutable() {
  # --- build executable binary --
  echo "-- llc and link to target=$bin_file"
  $llc $ir_file $llcopt -o=$obj_file
  $linker $linkopt $obj_file -o $bin_file
  if [ "$?" -eq "0" ]
  then
    echo "build SUCCERSS"
  else
    echo "!! build FAILED !!"
    exit 1
  fi

  # --- exec ---
  echo "-- exec binary=$bin_file --"
  $bin_file > $bin_result
  bin_exit=$?
  echo "bin exit code=$bin_exit"
}

CheckExitCode() {
  # -- compare exit coode --
  if [ "$check_exit" = "compareexit" ]
  then
    CompareExitCode
  elif [ "$check_exit" = "ignoreexit" ]
  then
    echo "... ignore exit code check."
  else
    CompareExitCodeWithNumber
  fi
}

CompareExitCode() {
  if [ "$direct_exit" -eq "$lli_exit" ]
  then
    echo "... node <-> lli exit code match: $direct_exit == $lli_exit"
  else
    echo "!! node <-> lli exit code NOT MATCH : $direct_exit != $lli_exit !!"
    echo "!! node <-> lli exit code NOT MATCH : $direct_exit != $lli_exit !!" > $exitcode_file
    exit 1
  fi

  if [ "$direct_exit" -eq "$bin_exit" ]
  then
    echo "... node <-> bin exit code match: $direct_exit == $bin_exit"
  else
    echo "!! node <-> bin exit code NOT MATCH : $direct_exit != $bin_exit !!"
    echo "!! node <-> bin exit code NOT MATCH : $direct_exit != $bin_exit !!" > $exitcode_file
    exit 1
  fi
}

CompareExitCodeWithNumber() {
  if [ "$lli_exit" -eq "$check_exit" ]
  then
    echo "... lli exit code OK: $$lli_exit == $check_exit"
  else
    echo "!! lli exit code NG : $lli_exit != $check_exit !!"
    echo "!! lli exit code NG : $lli_exit != $check_exit !!" > $exitcode_file
    exit 1
  fi

  if [ "$bin_exit" -eq "$check_exit" ]
  then
    echo "... bin exit code OK: $bin_exit == $check_exit"
  else
    echo "!! bin exit code NG : $bin_exit != $check_exit !!"
    echo "!! bin exit code NG : $bin_exit != $check_exit !!" > $exitcode_file
    exit 1
  fi
}

DiffResult() {
  diff --strip-trailing-cr $direct_result $lli_result > $diff_lli
  diff --strip-trailing-cr $direct_result $bin_result > $diff_bin
}

CleanUp() {
  if [ "$cleanup" = "remove" ]
  then
    echo "--cleanup ----"
    rm $direct_file $direct_result $lli_result $bin_result $ir_file $obj_file $bin_file
    rm $diff_lli $diff_bin
  fi
}

# ---- test -----
TestDirectWithHelper
TestCompile
TestExecutable

# -- compare exit coode --
if [ "$ignore_exit" = "ignoreexit" ]
then
  echo "... ignore exit code check."
else
  CheckExitCode
fi


# -- compere stdout ---
DiffResult
if [ -s $diff_lli ]
then
  echo "!!  node <-> lli stdout are different !!"
  cat $diff_lli
  exit 1
else
  echo "... node <-> lli stdout are same"
fi

if [ -s $diff_bin ]
then
  echo "!! node <-> bin stdout are different !!"
  cat $diff_bin
  exit 1
else
  echo "... node <-> bin stdout are same"
fi

# --- cleanup ---
CleanUp

# --- OK ----
exit 0
