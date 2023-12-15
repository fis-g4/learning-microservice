import { receiveMessages } from './rabbitmq/operations'
import './loadEnvironment'
import './db/conn'

const MICROSERVICE_QUEUE = 'learning_microservice'
const port = process.env.PORT ?? 8000

const app = require('./app')

receiveMessages(MICROSERVICE_QUEUE)

app.listen(port, () => {
    console.info(`Learning microservice listening on port ${port}`)
})
