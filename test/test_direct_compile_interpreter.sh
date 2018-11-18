#!/bin/sh
#
# usage:
#  sh test_direct_compile_interpreter.sh compilername interpretername filename preprocess(=[none|exitcode|builtin]) checkexit(=[compareexit|ignoreexit|number]) cleanup(=[remove|save]) 
#

compiler=../$1
interpreter=../$2
src=$3
jsfile=../sample/$src
diff_lli=tmp/diff_lli_$src.txt
diff_bin=tmp/diff_bin_$src.txt
diff_interp=tmp/diff_interp_$src.txt
diff_interp_interp=tmp/diff_interp_interp_$src.txt
diff_interp_compile_lli=tmp/diff_interp_compile_$src.txt
exitcode_file=tmp/exitcode_$src.txt
preprocess=$4
check_exit=$5
cleanup=$6


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

# --- for interpreter ---
interp_result=tmp/interp_$src.stdout.txt
interp_result_postproc=tmp/interp_post_$src.stdout.txt
interp_exit=0
interp_interp_result=tmp/interp_interp_$src.stdout.txt
interp_interp_result_postproc=tmp/interp_interp_post_$src.stdout.txt
interp_interp_exit=0

# --- for interpreter compile --
ir_file2=tmp/interp_$src.ll
lli_result2=tmp/lli_interp_$src.stdout.txt
lli_exit2=0

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

TestInterpreter() {
  echo "--- interpreter ---"
  #echo "EXEC node $interpreter $jsfile > $interp_result"
  node $interpreter $jsfile > $interp_result
  interp_exit=$?
  sed s/false/0/ $interp_result | sed s/true/1/ > $interp_result_postproc

  echo "interpreter exit code=$interp_exit"
}

TestInterpreterInterpreter() {
  echo "--- interpreter on interpreter---"
  #echo "EXEC node $interpreter $jsfile > $interp_result"
  node $interpreter $interpreter $jsfile > $interp_interp_result
  interp_interp_exit=$?
  sed s/false/0/ $interp_interp_result | sed s/true/1/ > $interp_interp_result_postproc

  echo "interpreter on interpreter exit code=$interp_interp_exit"
}

TestInterpreterCompiler() {
  echo "--- bin_file on interpreter---"
  #echo "EXEC node $interpreter $compiler $jsfile > $interp_result"
  node $interpreter $compiler $jsfile
  if [ "$?" -eq "0" ]
  then
    echo "interpreter compiler SUCCERSS"
    mv generated.ll $ir_file2
  else
    echo "!! interpreter compiler  FAILED !!"
    exit 1
  fi

  # --- exec ---
  echo "-- exec ir=$ir_file_interp_compile --"
  $lli $ir_file2 > $lli_result2
  lli_exit2=$?
  echo "lli exit code=$lli_exit2"
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

  if [ "$direct_exit" -eq "$lli_exit2" ]
  then
    echo "... node <-> interp compiled lli exit code match: $direct_exit == $lli_exit2"
  else
    echo "!! node <-> interp compiled lli  exit code NOT MATCH : $direct_exit != $lli_exit2 !!"
    echo "!! node <-> interp compiled lli  exit code NOT MATCH : $direct_exit != $lli_exit2 !!" > $exitcode_file
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
  #diff --strip-trailing-cr $direct_result $interp_result > $diff_interp
  #diff --strip-trailing-cr $direct_result $interp_interp_result > $diff_interp_interp
  diff --strip-trailing-cr $direct_result $interp_result_postproc > $diff_interp
  diff --strip-trailing-cr $direct_result $interp_interp_result_postproc > $diff_interp_interp
  diff --strip-trailing-cr $direct_result $lli_result2 > $diff_interp_compile_lli
}

CleanUp() {
  if [ "$cleanup" = "remove" ]
  then
    echo "--cleanup ----"
    #echo "rm $direct_file $direct_result $lli_result $bin_result $ir_file $obj_file $bin_file"
    rm $direct_file $direct_result $lli_result $bin_result $ir_file $obj_file $bin_file
    rm $diff_lli $diff_bin
    rm $diff_interp $interp_result $interp_result_postproc
    rm $diff_interp_interp $interp_interp_result $interp_interp_result_postproc
    rm $diff_interp_compile_lli $lli_result2 $ir_file2
  fi
}

# ---- test -----
TestDirectWithHelper
TestCompile
TestExecutable
TestInterpreter
TestInterpreterInterpreter
TestInterpreterCompiler

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

if [ -s $diff_interp ]
then
  echo "!! node <-> interpreter stdout are different !!"
  cat $diff_interp
  exit 1
else
  echo "... node <-> interpreter stdout are same"
fi

if [ -s $diff_interp_interp ]
then
  echo "!! node <-> interpreter on interpreter stdout are different !!"
  cat $diff_interp_interp
  exit 1
else
  echo "... node <-> interpreter on interpreter stdout are same"
fi

if [ -s $diff_interp_compile_lli ]
then
  echo "!! node <-> interpreter-compiler-lli stdout are different !!"
  cat $diff_interp_compile_lli
  exit 1
else
  echo "... node <-> interpreter-compiler-lli stdout are same"
fi

# --- cleanup ---
CleanUp

# --- OK ----
exit 0
