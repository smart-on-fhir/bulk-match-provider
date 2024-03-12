module.exports = {
    
    extensions: ["ts"],

    spec: ["./test/**/*.test.ts",],

    timeout: 15000,
    checkLeaks: true,
    allowUncaught: true,
    jobs: 1,
    parallel: false,
    retries: 0
}