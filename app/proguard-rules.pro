# Keep every name (the code is still shrunk and optimised), so crash reports say where the crash
# was (MainActivity$Bridge.testCrash, MainActivity.java:123) instead of shortened names (a.y.run).
# Wave has no libraries, so this costs only a few KB.
-dontobfuscate
-keepattributes SourceFile,LineNumberTable

# iAdb hands its connection over in a Container, found by name when the Bundle is read.
-keep class com.iadb.api.Container { *; }
