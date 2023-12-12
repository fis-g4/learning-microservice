import './loadEnvironment'
import './db/conn'

const port = process.env.PORT ?? 8000
const app = require('./app')

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
