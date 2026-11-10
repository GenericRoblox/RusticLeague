// Run any test with the bots' Math.random seeded, so the result is reproducible: node tests/seeded.js SEED tests/still.js legend 40 coupe
// (The bots use Math.random for aim choices and reaction noise, so without this the same command varies run to run.)
let rs = +process.argv[2] || 1; Math.random = () => { rs = (rs * 48271) % 2147483647; return rs / 2147483647; };
const script = process.argv[3]; process.argv.splice(2, 2); require(require('path').resolve(script));
