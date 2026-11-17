# CTest 用 cmake -P 运行本脚本；临时输入放在构建目录，不写源码目录。
if(NOT DEFINED PROGRAM OR NOT DEFINED CASE OR NOT DEFINED TEST_DIR)
    message(FATAL_ERROR "Pass PROGRAM, CASE and TEST_DIR from CTest")
endif()
file(MAKE_DIRECTORY "${TEST_DIR}")

set(expected_stdout "")
set(expected_stderr "")
set(args)
if(CASE STREQUAL "success")
    set(args "sample input.log")
    # 单参数文件名包含空格。内容末行没有换行，CRLF 的确切字节另由单元测试覆盖。
    file(WRITE "${TEST_DIR}/${args}" "  INFO start\n\tWARN\n\nERROR:\nERROR")
    set(expected_exit 0)
    set(expected_stdout "INFO 1\nWARN 1\nERROR 1\nUNKNOWN 1\n")
elseif(CASE STREQUAL "missing_file")
    set(args "missing.log")
    # 缺文件是此用例的前提；若路径被占用，先报告测试环境有问题。
    if(EXISTS "${TEST_DIR}/${args}")
        message(FATAL_ERROR "Fixture path must be absent: ${TEST_DIR}/${args}")
    endif()
    set(expected_exit 1)
    set(expected_stderr "logscan: cannot open 'missing.log'\n")
elseif(CASE STREQUAL "no_args" OR CASE STREQUAL "extra_args")
    if(CASE STREQUAL "extra_args")
        set(args "first.log" "second.log")
    endif()
    set(expected_exit 2)
    set(expected_stderr "Usage: logscan <file>\n")
else()
    message(FATAL_ERROR "Unknown CLI case: ${CASE}")
endif()

# 真实运行 CLI；退出码、标准输出、标准错误各取一份值。
execute_process(
    COMMAND "${PROGRAM}" ${args}
    WORKING_DIRECTORY "${TEST_DIR}"
    RESULT_VARIABLE actual_exit
    OUTPUT_VARIABLE actual_stdout
    ERROR_VARIABLE actual_stderr
    TIMEOUT 5)

function(expect_equal label expected actual)
    if(NOT "${actual}" STREQUAL "${expected}")
        message(FATAL_ERROR "${CASE}: ${label} mismatch\nExpected: [${expected}]\nActual: [${actual}]")
    endif()
endfunction()

# 只把 CRLF 统一成 LF；空格、行顺序和最后的换行都参与比较。
string(REPLACE "\r\n" "\n" actual_stdout "${actual_stdout}")
string(REPLACE "\r\n" "\n" actual_stderr "${actual_stderr}")
expect_equal("exit code" "${expected_exit}" "${actual_exit}")
expect_equal("stdout" "${expected_stdout}" "${actual_stdout}")
expect_equal("stderr" "${expected_stderr}" "${actual_stderr}")
