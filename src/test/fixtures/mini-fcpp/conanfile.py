# Test fixture only — never built by HeT DevTools CI.
from conan import ConanFile


class MiniFcpp(ConanFile):
    name = "mini-fcpp"
    version = "0.1.0"
    settings = "os", "compiler", "build_type", "arch"
