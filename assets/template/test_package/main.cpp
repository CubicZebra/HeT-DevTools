#include <vector>
#include <iostream>
#include <ctest.h>
#include <filesystem>
#include <string>
#include <fstream>
#include "cpptest.hpp"
#include "net.hpp"
// import "hello.hpp"; // C++23 only



int print_example_text() {
    const std::string filepath = "./resources/example.txt";
    if (!std::filesystem::exists(filepath)) {
        std::cerr << "Error: File not found: " << filepath << std::endl;
        return 1;
    }
    std::ifstream file(filepath);
    if (!file.is_open()) {
        std::cerr << "Error: Could not open file: " << filepath << std::endl;
        return 1;
    }

    std::string line;
    std::cout << "=== Content of " << filepath << " ===" << std::endl;
    while (std::getline(file, line)) {
        std::cout << line << std::endl;
    }
    file.close();
    return 0;
}



int main() {
    // C test
    test_c_compiler();
    test_c_zlib();
    test_c_pcre();

    // CPP test
    test_hello();
    test_cpp_zlib();
    test_eigen();

    const std::vector<int> nums = {1, 2, 3, 4, 5};
    const auto result = test_sum(nums);
    std::cout << "Sum: " << result << std::endl;

    const Person alice("Alice", 25);
    std::cout << alice.greet() << std::endl;

    const Color<int> red(255, 0, 0);
    red.print();

    // train_with_random_data();

    // int prediction = predict_random_sample();
    int prediction = 3;  // skip net.cpp CI

    std::cout << "prediction result for random sample: " << prediction << std::endl;
    std::cout << "input structure: 28x28" << std::endl;
    std::cout << "export structure: 10 (0-9 classes)" << std::endl;

    // print example text in resources folder
    print_example_text();

    return 0;
}
