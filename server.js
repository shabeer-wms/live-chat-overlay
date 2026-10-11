// Entry point: PORT and DATA_DIR are the only knobs.
//   /overlay  paste this URL into OBS (Browser Source)
//   /admin    login + settings
const path = require('node:path')
const createApp = require('./src/app')

const DATA = process.env.DATA_DIR || path.join(__dirname, 'data')
const PORT = process.env.PORT === undefined ? 3000 : Number(process.env.PORT)

if (require.main === module) createApp(DATA).listen(PORT)
module.exports = createApp
