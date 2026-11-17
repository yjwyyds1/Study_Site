cmake_minimum_required(VERSION 3.20)
project(logscan_build LANGUAGES CXX)
set(CMAKE_CXX_EXTENSIONS OFF)

# 扫描实现进静态库；PUBLIC 的编译要求和头文件路径交给两个调用方。
add_library(logscan_core STATIC logscan_core.cpp)
target_compile_features(logscan_core PUBLIC cxx_std_20)
target_include_directories(logscan_core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")

add_executable(logscan main.cpp)
# main.cpp 包含头文件获得声明；这一行让链接器找到库里的实现。
target_link_libraries(logscan PRIVATE logscan_core)

# CTest 注册的是测试命令。先构建，才能用 CTest 运行产物。
include(CTest)
if(BUILD_TESTING)
    add_executable(logscan_unit_tests tests/unit.cpp)
    target_link_libraries(logscan_unit_tests PRIVATE logscan_core)
    add_test(NAME unit_scan COMMAND logscan_unit_tests)

    # 传给脚本当前配置的程序位置，并给每个用例单独的运行目录。
    foreach(case IN ITEMS success missing_file no_args extra_args)
        add_test(NAME cli_${case} COMMAND "${CMAKE_COMMAND}"
            "-DPROGRAM=$<TARGET_FILE:logscan>"
            "-DCASE=${case}"
            "-DTEST_DIR=${CMAKE_CURRENT_BINARY_DIR}/cli-fixtures/${case}"
            -P "${CMAKE_CURRENT_SOURCE_DIR}/tests/cli.cmake")
    endforeach()
endif()
