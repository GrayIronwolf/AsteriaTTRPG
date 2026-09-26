// Compatibility command: every content build uses the canonical pipeline.
const pipeline = require('./generate-compendium');
if (require.main === module) pipeline.generate();
module.exports = pipeline;
